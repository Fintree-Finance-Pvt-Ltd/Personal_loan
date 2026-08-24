import { BadRequestException, Injectable, NotFoundException, Optional, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { IvrAutomationService } from '../integrations/ivr/ivr-automation.service';

@Injectable()
export class CreditReviewService {
  private readonly logger = new Logger(CreditReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ivrAutomationService?: IvrAutomationService,
  ) {}

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
    const result = await this.prisma.$transaction(async (tx) => {
      const application = await tx.plApplication.findUnique({ where: { id: applicationId } });
      if (!application) throw new NotFoundException('Application not found.');
      if (application.status !== 'PENDING_CREDIT_REVIEW') {
        throw new BadRequestException('Application is not pending final lender approval.');
      }
      if (!application.selectedAmount || !application.selectedTenure || !application.platformLan) {
        throw new BadRequestException('Application is missing the customer-selected offer required to finalize approval.');
      }

      let approvedRoi = application.lenderApprovedRoi;
      let processingFeePercent: any = null;
      if (application.productStrategyVersionId) {
        const productVersion = await tx.lenderProductVersion.findUnique({
          where: { id: application.productStrategyVersionId },
          select: { annualRoiPercent: true, processingFeePercent: true },
        });
        if (!approvedRoi) approvedRoi = productVersion?.annualRoiPercent ?? null;
        processingFeePercent = productVersion?.processingFeePercent ?? null;
      }
      if (!approvedRoi) {
        throw new BadRequestException('Unable to determine the applicable interest rate for this product.');
      }
      if (processingFeePercent === null) {
        throw new BadRequestException('Unable to determine the applicable processing fee for this product.');
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

      // The customer already completed Aadhaar verification during onboarding — that
      // result lives in KycVerificationStatus (one row per customer; the same table
      // loan.service.ts's own DigiLocker flow reads/writes), not ApplicationKycSnapshot.
      // Carry it + their DIGILOCKER-sourced permanent address, and their already-confirmed
      // current address, onto the new loan record so the customer is not asked to redo
      // DigiLocker verification or address confirmation post-approval (see
      // LoanService.saveAddress()/initiateMandate() for the fields this mirrors).
      const [kycStatus, permanentAddress, currentAddress] = await Promise.all([
        tx.kycVerificationStatus.findUnique({ where: { customerId: application.customerId } }),
        tx.applicationAddress.findUnique({ where: { applicationId_addressType: { applicationId: application.id, addressType: 'PERMANENT' } } }),
        tx.applicationAddress.findUnique({ where: { applicationId_addressType: { applicationId: application.id, addressType: 'CURRENT' } } }),
      ]);

      // acceptOffer() normally computes and persists these bullet-payment figures when a
      // customer picks an offer, but that method can never run here — acceptedTenureDays
      // is already being set below at loan creation, and acceptOffer() refuses to run once
      // it's set. Without this, resolveMandateConfiguration() falls back to authorizing the
      // e-Mandate for principal only, undercutting the interest already shown to the
      // customer on the KFS screen (getPostApprovalJourney uses the identical formula as
      // its own acceptedTotalRepayment fallback, so the two stay consistent).
      const principal = Number(application.selectedAmount);
      const tenureDays = application.selectedTenure;
      const processingFee = Math.round(principal * (Number(processingFeePercent) / 100));
      const totalInterest = Math.round((principal * Number(approvedRoi) * tenureDays) / 36500);
      const totalRepayment = principal + totalInterest;

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
          acceptedProcessingFee: processingFee,
          acceptedTotalRepayment: totalRepayment,
          acceptedEmiAmount: totalRepayment,
          ...(kycStatus?.aadhaarStatus === 'VERIFIED'
            ? {
                digilockerStatus: 'VERIFIED',
                digilockerVerifiedAt: kycStatus.updatedAt,
                aadhaarMaskedNumber: kycStatus.aadhaarMaskedNumber,
                aadhaarLastFour: kycStatus.aadhaarMaskedNumber?.slice(-4) ?? null,
                aadhaarVerifiedName: kycStatus.aadhaarName,
                aadhaarDateOfBirth: kycStatus.aadhaarDob,
                ...(permanentAddress
                  ? {
                      aadhaarAddrLine1: permanentAddress.addressLine1,
                      aadhaarAddrLine2: permanentAddress.addressLine2,
                      aadhaarLandmark: permanentAddress.landmark,
                      aadhaarLocality: permanentAddress.locality,
                      aadhaarDistrict: permanentAddress.district,
                      aadhaarCity: permanentAddress.city,
                      aadhaarState: permanentAddress.state,
                      aadhaarCountry: permanentAddress.country,
                      aadhaarPincode: permanentAddress.pincode,
                      aadhaarFormattedAddr: [permanentAddress.addressLine1, permanentAddress.addressLine2, permanentAddress.landmark, permanentAddress.locality, permanentAddress.city, permanentAddress.state, permanentAddress.pincode].filter(Boolean).join(', '),
                    }
                  : kycStatus.aadhaarAddress
                    ? { aadhaarFormattedAddr: kycStatus.aadhaarAddress }
                    : {}),
              }
            : {}),
          // Mirrors LoanService.saveAddress(): the customer already confirmed a current
          // address during onboarding, so carry it over instead of asking again.
          ...(currentAddress
            ? {
                addressConfirmed: true,
                addressConfirmedAt: decidedAt,
                addressSameAsPermanent: currentAddress.sameAsPermanent ?? false,
                currentAddrLine1: currentAddress.addressLine1,
                currentAddrLine2: currentAddress.addressLine2,
                currentAddrLandmark: currentAddress.landmark,
                currentAddrLocality: currentAddress.locality,
                currentAddrDistrict: currentAddress.district,
                currentAddrCity: currentAddress.city,
                currentAddrState: currentAddress.state,
                currentAddrCountry: currentAddress.country,
                currentAddrPincode: currentAddress.pincode,
                currentAddrProofType: currentAddress.source === 'DIGILOCKER' ? 'AADHAAR' : null,
              }
            : {}),
        },
        update: {},
      });

      return { application: updatedApplication, loan, decidedByUserId };
    });

    if (this.ivrAutomationService) {
      this.ivrAutomationService.triggerLoanApprovedCall(applicationId, result.application.platformLan || undefined).catch((err) => {
        this.logger.warn(`Failed to auto-trigger IVR loan approval call for app #${applicationId}: ${err?.message}`);
      });
    }

    return result;
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
