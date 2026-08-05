import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class CreditReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async listPending() {
    const applications = await this.prisma.plApplication.findMany({
      where: { status: 'PENDING_CREDIT_REVIEW' },
      orderBy: { lenderDecisionAt: 'asc' },
      include: { customer: true },
    });

    return applications.map((application) => ({
      applicationId: application.id.toString(),
      applicationReference: application.applicationNumber,
      customerId: application.customerId.toString(),
      customerName: application.customer.fullName,
      customerMobile: application.customer.mobileNumber,
      lenderId: application.lenderId,
      lenderCode: application.lenderCode,
      lenderApprovedAmount: application.lenderApprovedAmount?.toNumber() ?? null,
      lenderApprovedTenure: application.lenderApprovedTenure,
      lenderApprovedRoi: application.lenderApprovedRoi?.toNumber() ?? null,
      lenderDecisionAt: application.lenderDecisionAt,
    }));
  }

  async approve(applicationId: bigint, decidedByUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.plApplication.findUnique({ where: { id: applicationId } });
      if (!application) throw new NotFoundException('Application not found.');
      if (application.status !== 'PENDING_CREDIT_REVIEW') {
        throw new BadRequestException('Application is not pending credit review.');
      }
      if (!application.lenderApprovedAmount || !application.lenderApprovedTenure || !application.lenderApprovedRoi || !application.platformLan) {
        throw new BadRequestException('Application is missing the lender-approved terms required to finalize approval.');
      }

      const decidedAt = new Date();

      const updatedApplication = await tx.plApplication.update({
        where: { id: application.id },
        data: { status: 'LENDER_APPROVED' },
      });

      await tx.customer.update({
        where: { id: application.customerId },
        data: { onboardingStatus: 'LENDER_APPROVED', lastActivityAt: decidedAt },
      });

      const loan = await tx.plLoan.upsert({
        where: { applicationId: application.id },
        create: {
          lan: application.platformLan,
          customerId: application.customerId,
          applicationId: application.id,
          lenderCode: application.lenderCode || application.lenderId || 'LENDER',
          status: 'LENDER_APPROVED',
          currentStep: 'APPROVAL_SUMMARY',
          approvedAmount: application.lenderApprovedAmount,
          lenderApprovedAt: decidedAt,
          offerStatus: 'AVAILABLE',
          offerAllowedTenures: JSON.stringify([application.lenderApprovedTenure]),
          offerValidUntil: new Date(decidedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {},
      });

      return { application: updatedApplication, loan, decidedByUserId };
    });
  }

  async reject(applicationId: bigint, decidedByUserId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.plApplication.findUnique({ where: { id: applicationId } });
      if (!application) throw new NotFoundException('Application not found.');
      if (application.status !== 'PENDING_CREDIT_REVIEW') {
        throw new BadRequestException('Application is not pending credit review.');
      }

      const decidedAt = new Date();
      const trimmedReason = reason?.trim();

      const updatedApplication = await tx.plApplication.update({
        where: { id: application.id },
        data: {
          status: 'LENDER_REJECTED',
          lenderDecisionReason: trimmedReason ? `Credit review rejected: ${trimmedReason}` : 'Rejected by internal credit review.',
        },
      });

      await tx.customer.update({
        where: { id: application.customerId },
        data: { onboardingStatus: 'LENDER_REJECTED', lastActivityAt: decidedAt },
      });

      return { application: updatedApplication, decidedByUserId };
    });
  }
}
