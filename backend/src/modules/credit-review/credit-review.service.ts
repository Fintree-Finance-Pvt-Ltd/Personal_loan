import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class CreditReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async listPending() {
    const applications = await this.prisma.plApplication.findMany({
      where: { status: 'PENDING_CREDIT_REVIEW' },
      orderBy: { selectedAt: 'asc' },
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
      selectedAmount: application.selectedAmount?.toNumber() ?? null,
      selectedTenure: application.selectedTenure,
      selectedAt: application.selectedAt,
      lenderDecisionAt: application.lenderDecisionAt,
    }));
  }

  // Manual override for the final (second) lender decision: the async lender webhook
  // is the primary path (see LenderDecisionProcessor.process()) — this lets a credit
  // team member finalize the same outcome by hand while that result is still pending.
  async approve(applicationId: bigint, decidedByUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.plApplication.findUnique({ where: { id: applicationId } });
      if (!application) throw new NotFoundException('Application not found.');
      if (application.status !== 'PENDING_CREDIT_REVIEW') {
        throw new BadRequestException('Application is not pending final lender approval.');
      }
      if (!application.selectedAmount || !application.selectedTenure || !application.platformLan) {
        throw new BadRequestException('Application is missing the customer-selected offer required to finalize approval.');
      }

      let approvedRoi = application.lenderApprovedRoi;
      if (!approvedRoi && application.productStrategyVersionId) {
        const productVersion = await tx.lenderProductVersion.findUnique({
          where: { id: application.productStrategyVersionId },
          select: { annualRoiPercent: true },
        });
        approvedRoi = productVersion?.annualRoiPercent ?? null;
      }
      if (!approvedRoi) {
        throw new BadRequestException('Unable to determine the applicable interest rate for this product.');
      }

      const decidedAt = new Date();

      const updatedApplication = await tx.plApplication.update({
        where: { id: application.id },
        data: { status: 'LENDER_APPROVED', lenderApprovedRoi: approvedRoi, lenderDecisionAt: decidedAt },
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
          approvedAmount: application.selectedAmount,
          lenderApprovedAt: decidedAt,
          offerStatus: 'ACCEPTED',
          offerAllowedTenures: JSON.stringify([application.selectedTenure]),
          acceptedTenureDays: application.selectedTenure,
          acceptedAt: decidedAt,
          acceptedInterestRate: approvedRoi,
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
