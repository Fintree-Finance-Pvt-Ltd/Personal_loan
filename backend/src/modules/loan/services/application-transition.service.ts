import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PlApplicationStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';

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
    platformProductId: string | null = null,
    requestedAmount: number | null = null,
    scopeCode: string = 'PLATFORM_DEFAULT'
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Check for an active application
      const activeApplication = await tx.plApplication.findFirst({
        where: {
          customerId,
          status: {
            in: [
              PlApplicationStatus.DRAFT,
              PlApplicationStatus.SUBMITTED,
              PlApplicationStatus.ALLOCATION_PENDING,
              PlApplicationStatus.LENDER_ALLOCATED,
              PlApplicationStatus.LENDER_REVIEW,
            ]
          }
        },
      });

      if (activeApplication) {
        // If an active app exists but for a different product (and product was requested), we reject (only 1 active overall allowed)
        if (platformProductId && activeApplication.platformProductId !== platformProductId) {
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
          requestedAmount: requestedAmount ? new Prisma.Decimal(requestedAmount) : null,
        },
      });

      this.logger.log(`Created new canonical application ${applicationNumber} for customer ${customerId}`);
      return newApp;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Prevent race conditions on active check
    });
  }
}
