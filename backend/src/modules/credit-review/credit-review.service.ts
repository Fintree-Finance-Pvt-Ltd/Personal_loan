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
