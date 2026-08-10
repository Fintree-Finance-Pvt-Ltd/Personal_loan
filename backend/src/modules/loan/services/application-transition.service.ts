import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PlApplicationStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ACTIVE_APPLICATION_STATUSES } from '../../../common/constants/application.constants';

@Injectable()
export class ApplicationTransitionService {
  private readonly logger = new Logger(ApplicationTransitionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently creates or resumes an application for the customer.
   * Enforces that a customer can only have one active application.
   */
  async createOrResumeApplication(
    customerId: bigint,
    platformProductId: string,
    scopeCode: string = 'PLATFORM_DEFAULT'
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 0. Acquire row lock on the Customer to prevent concurrent creation
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`;

      // 1. Check for an active application
      const activeApplication = await tx.plApplication.findFirst({
        where: {
          customerId,
          status: {
            in: ACTIVE_APPLICATION_STATUSES
          }
        },
      });

      if (activeApplication) {
        // If an active app exists but for a different product (and product was requested), we reject (only 1 active overall allowed)
        if (activeApplication.platformProductId !== platformProductId) {
            throw new ConflictException(
              `You already have an active application (${activeApplication.applicationNumber}) for a different product.`
            );
        }
        
        // If it's the same product, resume it (idempotent return)
        this.logger.log(`Resuming existing application ${activeApplication.applicationNumber} for customer ${customerId}`);
        return activeApplication;
      }

      // 2. No active application exists; create a new one safely
      const datePart = new Date().toISOString().slice(2, 10).replaceAll('-', '');
      const randomPart = randomBytes(4).toString('hex').toUpperCase();
      const applicationNumber = `APP-${datePart}-${randomPart}`;

      const newApp = await tx.plApplication.create({
        data: {
          customerId,
          applicationNumber,
          status: PlApplicationStatus.DRAFT,
          platformProductId,
          scopeCode,
          // Retained for future use; the current customer flow is lender-determined.
          requestedAmount: null,
        },
      });

      this.logger.log(`Created new canonical application ${applicationNumber} for customer ${customerId}`);
      return newApp;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Prevent race conditions on active check
    });
  }

  async submitCanonicalApplication(customerId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`;
      const application = await tx.plApplication.findFirst({ where: { customerId }, orderBy: { id: 'desc' } });
      if (!application) throw new ConflictException('Canonical application was not found.');
      if (application.status === PlApplicationStatus.SUBMITTED || application.status === PlApplicationStatus.LENDER_REVIEW || application.status === PlApplicationStatus.LENDER_APPROVED) return application;
      if (application.status !== PlApplicationStatus.ASSESSMENT_FEE_PAID) {
        throw new ConflictException(`Application cannot be submitted from ${application.status}.`);
      }
      return tx.plApplication.update({
        where: { id: application.id },
        data: { status: PlApplicationStatus.SUBMITTED, submittedAt: application.submittedAt || new Date() },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
