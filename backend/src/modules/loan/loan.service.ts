import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ConflictException, UnprocessableEntityException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PlApplicationStatus, PlLoanStatus, PlDocumentType, PlDocumentStatus, PlMandateStatus, PlMandateType, PlMandateProvider, Prisma } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { DigitapDigilockerService } from '../external-api/digitap-digilocker.service';
import { ExternalApiService } from '../external-api/external-api.service';
import { EasebuzzAutocollectService } from '../../integrations/easebuzz-autocollect.service';
import { initiateEasebuzzIframePayment } from '../../integrations/easebuzz-iframe.integration';
import { decryptBankAccountNumber } from '../../common/utils/bank-security.helper';
import { normalizeDigitapDetails, sanitizeDigitapPayload } from './digilocker-normalizer';
import { ProductCalculationService } from '../products/product-calculation.service';
import { LenderIntegrationOutboxService } from '../lender-integrations/lender-integration-outbox.service';

@Injectable()
export class LoanService {
  private readonly logger = new Logger(LoanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly digitapService: DigitapDigilockerService,
    private readonly externalApiService: ExternalApiService,
    private readonly easebuzzAutocollectService: EasebuzzAutocollectService,
    private readonly configService: ConfigService,
    private readonly productCalculationService: ProductCalculationService,
    private readonly lenderIntegrationOutbox: LenderIntegrationOutboxService,
  ) { }



  async findLoanByLanAndCustomer(lan: string, customerId: bigint) {
    if (!customerId || customerId <= 0n) {
      throw new NotFoundException('Loan not found or does not belong to this customer');
    }
    const where = { lan, customerId };

    const includeOptions = {
      application: true,
      customer: true,
      bankVerification: true,
      mandates: {
        orderBy: { createdAt: 'desc' as const },
        take: 5,
      },
    };

    const loan = await this.prisma.plLoan.findFirst({
      where,
      include: includeOptions,
    });

    if (!loan) {
      throw new NotFoundException('Loan not found or does not belong to this customer');
    }

    return loan;
  }

  async createLoanAfterApproval(applicationId: bigint, customerId: bigint, amount: number, lenderCode: string = 'FTF') {
    // Idempotency check: see if loan already exists for this application
    const existingLoan = await this.prisma.plLoan.findFirst({
      where: { applicationId, customerId },
    });

    if (existingLoan) {
      return existingLoan;
    }

    const application = await this.prisma.plApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application || application.customerId !== customerId) {
      throw new NotFoundException('Application not found');
    }

    if (application.status !== PlApplicationStatus.LENDER_APPROVED) {
      throw new BadRequestException('Application is not approved by lender');
    }

    const lan = application.platformLan;
    if (!lan) {
      throw new BadRequestException('Platform LAN is missing on the application');
    }

    // Create the offer valid for 30 days
    const offerValidUntil = new Date();
    offerValidUntil.setDate(offerValidUntil.getDate() + 30);

    // Dev/UAT-only shortcut (see simulateLenderApproval) — mirrors the same onboarding
    // KYC/address carry-over as CreditReviewService.approve(), the real loan-creation
    // path, so a loan created here doesn't get stuck behind DigiLocker/address gates
    // that the customer already satisfied during onboarding.
    const [kycStatus, permanentAddress, currentAddress] = await Promise.all([
      this.prisma.kycVerificationStatus.findUnique({ where: { customerId } }),
      this.prisma.applicationAddress.findUnique({ where: { applicationId_addressType: { applicationId, addressType: 'PERMANENT' } } }),
      this.prisma.applicationAddress.findUnique({ where: { applicationId_addressType: { applicationId, addressType: 'CURRENT' } } }),
    ]);

    const loan = await this.prisma.plLoan.create({
      data: {
        lan,
        customerId,
        applicationId,
        lenderCode,
        status: PlLoanStatus.LENDER_APPROVED,
        currentStep: 'APPROVAL_SUMMARY',
        approvedAmount: amount,
        lenderApprovedAt: new Date(),
        offerStatus: 'AVAILABLE',
        offerAllowedTenures: JSON.stringify([3, 6, 9, 12, 18, 24]),
        offerValidUntil,
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
        ...(currentAddress
          ? {
              addressConfirmed: true,
              addressConfirmedAt: new Date(),
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
    });

    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'LOAN_LAN_CREATED',
      entityType: 'PlLoan',
      entityId: loan.id.toString(),
      outcome: 'SUCCESS',
      newValue: { lan: loan.lan, status: loan.status },
      requestId: randomBytes(16).toString('hex'),
    }).catch(() => { /* non-critical */ });

    return loan;
  }

  deriveCurrentStep(loan: any): string {
    if (loan.disbursalStatus === 'DISBURSED' || loan.status === PlLoanStatus.DISBURSED) {
      return 'DISBURSED';
    }
    if (loan.disbursalStatus === 'DISBURSAL_PROCESSING' || loan.disbursalStatus === 'DISBURSAL_REQUESTED' || loan.status === PlLoanStatus.DISBURSAL_PROCESSING) {
      return 'DISBURSAL_PROCESSING';
    }
    if (
      loan.status === PlLoanStatus.READY_FOR_DISBURSAL ||
      loan.currentStep === 'READY_FOR_DISBURSAL' ||
      (loan.acceptedTenureDays &&
        loan.bankVerified &&
        loan.kfsAccepted &&
        loan.mandateCompleted &&
        loan.esignCompleted)
    ) {
      return 'READY_FOR_DISBURSAL';
    }
    if (loan.esignCompleted) {
      return 'READY_FOR_DISBURSAL';
    }
    if (loan.mandateCompleted) {
      return 'ESIGN';
    }
    if (loan.kfsAccepted) {
      return 'EMANDATE';
    }
    if (loan.bankVerified) {
      return 'KFS_ACCEPTANCE';
    }
    if (loan.acceptedTenureDays) {
      return 'BANK_VERIFICATION';
    }

    return 'APPROVAL_SUMMARY';
  }

  /**
   * Parses the initiation snapshot stashed in PlLoan.digilockerRawResponse so an
   * in-flight session can be resumed instead of always starting a fresh one.
   */
  private readStoredDigilockerInitiation(raw?: string | null): { verificationUrl?: string; kycUrl?: string; transactionId?: string; expiresAt?: string } | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.verificationUrl || !parsed?.expiresAt) return null;
      if (new Date(parsed.expiresAt).getTime() < Date.now()) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async getPostApprovalJourney(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

    // Fire-and-forget audit log — customer ID is not an admin user, so actorUserId is null
    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'POST_APPROVAL_JOURNEY_OPENED',
      entityType: 'PlLoan',
      entityId: loan.id.toString(),
      outcome: 'SUCCESS',
      requestId: randomBytes(16).toString('hex'),
    }).catch(() => { /* non-critical — never fail the request */ });


    let effectiveDigilockerVerified = loan.digilockerStatus === 'VERIFIED';
    if (!effectiveDigilockerVerified) {
      const kycRecord = await this.prisma.kycVerificationStatus.findUnique({
        where: { customerId },
        select: { aadhaarStatus: true, aadhaarName: true, aadhaarMaskedNumber: true, aadhaarDob: true, aadhaarAddress: true, updatedAt: true },
      });
      if (kycRecord?.aadhaarStatus === 'VERIFIED') {
        effectiveDigilockerVerified = true;
        // Back-fill the loan so subsequent calls (and mandate gate) see it immediately.
        await this.prisma.plLoan.update({
          where: { id: loan.id },
          data: {
            digilockerStatus: 'VERIFIED',
            digilockerVerifiedAt: kycRecord.updatedAt ?? new Date(),
            ...(kycRecord.aadhaarName ? { aadhaarVerifiedName: kycRecord.aadhaarName } : {}),
            ...(kycRecord.aadhaarMaskedNumber
              ? { aadhaarMaskedNumber: kycRecord.aadhaarMaskedNumber, aadhaarLastFour: kycRecord.aadhaarMaskedNumber.slice(-4) }
              : {}),
            ...(kycRecord.aadhaarDob ? { aadhaarDateOfBirth: kycRecord.aadhaarDob } : {}),
            ...(kycRecord.aadhaarAddress ? { aadhaarFormattedAddr: kycRecord.aadhaarAddress } : {}),
          },
        });
        // Patch in-memory so downstream code sees the updated values.
        (loan as any).digilockerStatus = 'VERIFIED';
        (loan as any).digilockerVerifiedAt = kycRecord.updatedAt ?? new Date();
        if (kycRecord.aadhaarName) (loan as any).aadhaarVerifiedName = kycRecord.aadhaarName;
        if (kycRecord.aadhaarMaskedNumber) (loan as any).aadhaarMaskedNumber = kycRecord.aadhaarMaskedNumber;
        this.logger.log(`[getPostApprovalJourney] Back-filled digilockerStatus=VERIFIED on loan ${loan.id} (${lan}) from kycVerificationStatus for customerId=${customerId}`);
      }
    }

    // Address auto-confirm: if address isn't confirmed yet but KYC is verified + address data exists,
    // silently confirm it (same logic as in initiateMandate) so the journey shows the correct state.
    if (!loan.addressConfirmed && loan.digilockerStatus === 'VERIFIED') {
      const hasLoanAadhaarAddr = !!(loan.aadhaarAddrLine1 || loan.aadhaarCity || loan.aadhaarFormattedAddr);
      if (hasLoanAadhaarAddr) {
        await this.prisma.plLoan.update({
          where: { id: loan.id },
          data: {
            addressConfirmed: true,
            addressConfirmedAt: new Date(),
            addressSameAsPermanent: true,
            currentAddrProofType: 'AADHAAR',
            currentAddrLine1: loan.aadhaarAddrLine1 ?? loan.aadhaarFormattedAddr ?? null,
            currentAddrLine2: loan.aadhaarAddrLine2 ?? null,
            currentAddrLandmark: loan.aadhaarLandmark ?? null,
            currentAddrLocality: loan.aadhaarLocality ?? null,
            currentAddrDistrict: loan.aadhaarDistrict ?? null,
            currentAddrCity: loan.aadhaarCity ?? null,
            currentAddrState: loan.aadhaarState ?? null,
            currentAddrCountry: loan.aadhaarCountry ?? 'India',
            currentAddrPincode: loan.aadhaarPincode ?? null,
          },
        });
        (loan as any).addressConfirmed = true;
        this.logger.log(`[getPostApprovalJourney] Auto-confirmed address (same as Aadhaar) for loan ${loan.id} (${lan}), customerId=${customerId}`);
      } else {
        // No structured address — try formatted string from kycVerificationStatus
        const kycAddr = await this.prisma.kycVerificationStatus.findUnique({
          where: { customerId },
          select: { aadhaarAddress: true },
        });
        if (kycAddr?.aadhaarAddress) {
          await this.prisma.plLoan.update({
            where: { id: loan.id },
            data: {
              addressConfirmed: true,
              addressConfirmedAt: new Date(),
              addressSameAsPermanent: true,
              currentAddrProofType: 'AADHAAR',
              currentAddrLine1: kycAddr.aadhaarAddress,
              currentAddrCountry: 'India',
            },
          });
          (loan as any).addressConfirmed = true;
          this.logger.log(`[getPostApprovalJourney] Auto-confirmed address from kycVerificationStatus for loan ${loan.id} (${lan}), customerId=${customerId}`);
        }
      }
    }

    // Derive stable workflow state
    const currentStep = this.deriveCurrentStep(loan);

    // Normalize address for frontend
    let permanentAddress = null;
    if (loan.digilockerStatus === 'VERIFIED') {
      permanentAddress = {
        addressLine1: loan.aadhaarAddrLine1,
        addressLine2: loan.aadhaarAddrLine2,
        landmark: loan.aadhaarLandmark,
        locality: loan.aadhaarLocality,
        district: loan.aadhaarDistrict,
        city: loan.aadhaarCity,
        state: loan.aadhaarState,
        country: loan.aadhaarCountry,
        pincode: loan.aadhaarPincode,
        formattedAddress: loan.aadhaarFormattedAddr,
        source: 'DIGILOCKER_AADHAAR',
        verified: true,
      };
    }

    let currentAddress = null;
    if (loan.addressConfirmed) {
      currentAddress = {
        addressLine1: loan.currentAddrLine1,
        addressLine2: loan.currentAddrLine2,
        landmark: loan.currentAddrLandmark,
        locality: loan.currentAddrLocality,
        district: loan.currentAddrDistrict,
        city: loan.currentAddrCity,
        state: loan.currentAddrState,
        country: loan.currentAddrCountry,
        pincode: loan.currentAddrPincode,
        residenceSince: loan.currentAddrResidenceSince,
        proofType: loan.currentAddrProofType,
        sameAsPermanent: loan.addressSameAsPermanent,
      };
    }

    const approvedAmount = loan.approvedAmount ? Number(loan.approvedAmount) : 0;
    const interestRate = loan.acceptedInterestRate ? Number(loan.acceptedInterestRate) : 18;
    const tenureDays = loan.acceptedTenureDays || 30;
    const processingFee = loan.acceptedProcessingFee ? Number(loan.acceptedProcessingFee) : Math.round(approvedAmount * 0.02);
    const processingFeeGst = Math.round(processingFee * 0.18);
    const netDisbursalAmount = approvedAmount - processingFee - processingFeeGst;

    let totalInterest = 0;
    if (loan.acceptedTotalRepayment && Number(loan.acceptedTotalRepayment) > approvedAmount) {
      totalInterest = Number(loan.acceptedTotalRepayment) - approvedAmount;
    } else {
      totalInterest = Math.round((approvedAmount * interestRate * tenureDays) / 36500);
    }

    const totalRepaymentAmount = approvedAmount + totalInterest;

    // APR Calculation: ((Total Interest + Processing Fee + GST) / Loan Amount) * (365 / Tenure Days) * 100
    const totalCharges = totalInterest + processingFee + processingFeeGst;
    const apr = approvedAmount > 0 ? Number(((totalCharges / approvedAmount) * (365 / tenureDays) * 100).toFixed(2)) : interestRate;

    let dueDate = null;
    if (loan.acceptedTenureDays) {
      const d = new Date();
      d.setDate(d.getDate() + loan.acceptedTenureDays);
      dueDate = d.toISOString();
    }

    const kfs = {
      lan: loan.lan,
      loanAmount: approvedAmount,
      tenureDays,
      interestRate,
      totalInterest,
      processingFee,
      processingFeeGst,
      totalCharges,
      netDisbursalAmount,
      totalRepaymentAmount,
      apr,
      dueDate,
      kfsAccepted: loan.kfsAccepted,
      kfsAcceptedAt: loan.kfsAcceptedAt,
      documentUrl: loan.kfsDocumentId || null,
      borrowerName: loan.customer?.fullName || null,
      borrowerPan: loan.customer?.panNumber || null,
      bankName: loan.bankName || null,
      accountMasked: loan.bankAccountMasked || null,
      ifsc: loan.bankIfsc || null,
    };

    return {
      loan: {
        id: loan.id.toString(),
        lan: loan.lan,
        status: loan.status,
        applicationId: loan.applicationId ? loan.applicationId.toString() : null,
        applicationNumber: loan.application?.applicationNumber,
        approvedAmount: approvedAmount,
        approvedAt: loan.lenderApprovedAt,
        disbursalRequestedAt: loan.disbursalRequestedAt,
        disbursalCompletedAt: loan.disbursalCompletedAt,
      },
      customer: {
        customerCode: loan.customer?.customerCode,
        fullName: loan.customer?.fullName,
      },
      lender: {
        code: loan.lenderCode,
        name: 'Fintree Finance Private Limited',
      },
      offer: {
        offerStatus: loan.offerStatus,
        approvedAmount: approvedAmount,
        allowedTenures: (() => {
          try {
            return loan.offerAllowedTenures ? JSON.parse(loan.offerAllowedTenures) : [30, 45, 60, 90];
          } catch {
            return [30, 45, 60, 90];
          }
        })(),
        validUntil: loan.offerValidUntil,
        acceptedTenureDays: loan.acceptedTenureDays,
        acceptedInterestRate: loan.acceptedInterestRate ? Number(loan.acceptedInterestRate) : null,
        acceptedProcessingFee: processingFee,
        acceptedEmiAmount: loan.acceptedEmiAmount ? Number(loan.acceptedEmiAmount) : null,
        acceptedTotalRepayment: totalRepaymentAmount,
      },
      digilocker: {
        status: loan.digilockerStatus || 'NOT_STARTED',
        maskedAadhaar: loan.aadhaarMaskedNumber,
        verifiedAt: loan.digilockerVerifiedAt,
        permanentAddress,
      },
      address: currentAddress,
      bank: {
        verified: loan.bankVerified,
        accountHolderName: loan.bankAccountHolderName,
        accountType: loan.bankAccountType,
        accountMasked: loan.bankAccountMasked,
        ifsc: loan.bankIfsc,
        bankName: loan.bankName,
        verifiedAt: loan.bankVerifiedAt,
      },
      kfs,
      mandate: (() => {
        const latestMandate = (loan as any).mandates?.[0];
        const isMandateAuth = loan.mandateCompleted || latestMandate?.status === 'AUTHORIZED' || latestMandate?.status === 'COMPLETED';

        let safePortalUrl = isMandateAuth ? null : (latestMandate?.portalUrl || null);
        if (safePortalUrl && safePortalUrl.includes('testpay.easebuzz.in')) {
          safePortalUrl = safePortalUrl.replace('testpay.easebuzz.in', 'pay.easebuzz.in');
        }

        const parseDateString = (d: any) => {
          if (!d) return null;
          const dt = new Date(d);
          return !isNaN(dt.getTime()) ? dt.toISOString().split('T')[0] : null;
        };

        return {
          status: latestMandate?.status || (loan.mandateCompleted ? 'AUTHORIZED' : 'NOT_STARTED'),
          completed: Boolean(isMandateAuth),
          mandateType: latestMandate?.mandateType || 'ENACH',
          amount: latestMandate?.amount ? Number(latestMandate.amount) : totalRepaymentAmount,
          frequency: latestMandate?.frequency || 'monthly',
          startDate: parseDateString(latestMandate?.startDate),
          endDate: parseDateString(latestMandate?.endDate),
          maskedAccountNumber: latestMandate?.accountNumberMasked || loan.bankAccountMasked || null,
          bankName: loan.bankName || null,
          mandateId: latestMandate?.providerMandateId || loan.mandateProviderRef || null,
          umrnMasked: latestMandate?.umrn ? `***${String(latestMandate.umrn).slice(-4)}` : null,
          authorizedAt: latestMandate?.authorizedAt || loan.mandateCompletedAt || null,
          portalUrl: safePortalUrl,
          transactionId: latestMandate?.merchantTransactionId || null,
        };
      })(),
      esign: {
        completed: loan.esignCompleted,
        status: loan.esignStatus,
        completedAt: loan.esignCompletedAt,
      },
      workflow: {
        lenderApproved: loan.status !== PlLoanStatus.FAILED && loan.status !== PlLoanStatus.CANCELLED,
        offerAccepted: !!loan.acceptedTenureDays,
        // loan.digilockerStatus is patched in-memory above when the KYC fallback fires,
        // so this check covers both the normal and the onboarding-sync-missed cases.
        digilockerVerified: loan.digilockerStatus === 'VERIFIED',
        addressConfirmed: loan.addressConfirmed,
        bankVerified: loan.bankVerified,
        kfsAccepted: loan.kfsAccepted,
        mandateCompleted: Boolean(
          loan.mandateCompleted ||
          (loan as any).mandates?.[0]?.status === 'AUTHORIZED' ||
          (loan as any).mandates?.[0]?.status === 'COMPLETED'
        ),
        esignCompleted: loan.esignCompleted,
        readyForDisbursal:
          Boolean(
            loan.acceptedTenureDays &&
            loan.bankVerified &&
            loan.kfsAccepted &&
            loan.mandateCompleted &&
            loan.esignCompleted
          ) ||
          loan.status === PlLoanStatus.READY_FOR_DISBURSAL ||
          loan.status === PlLoanStatus.DISBURSAL_PROCESSING ||
          loan.status === PlLoanStatus.DISBURSED,
        disbursalStatus: loan.disbursalStatus || 'NOT_STARTED',
        currentStep,
      },
    };
  }


  async acceptOffer(lan: string, customerId: bigint, tenureDays: number) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

    if (loan.acceptedTenureDays) {
      throw new BadRequestException('Offer already accepted');
    }

    // Only validate tenures if the list is set
    if (loan.offerAllowedTenures) {
      try {
        const allowed = JSON.parse(loan.offerAllowedTenures);
        if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(tenureDays)) {
          throw new BadRequestException('Invalid tenure selected');
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        // If JSON.parse fails, skip validation
      }
    }

    // Bullet Payment Pricing Calculation
    // Formula from Excel: Interest = ROUND(loan amount * interest rate * 1/365 * tenure, 0)
    const principal = Number(loan.approvedAmount) || 0;
    const interestRate = 18.0;
    const processingFee = Math.round(principal * 0.02);
    const tenureFraction = tenureDays / 365;
    const interestAmount = Math.round(principal * (interestRate / 100) * tenureFraction);
    const totalRepayment = principal + interestAmount;
    const emi = totalRepayment;

    await this.prisma.plLoan.update({
      where: { id: loan.id },
      data: {
        offerStatus: 'ACCEPTED',
        acceptedTenureDays: tenureDays,
        acceptedAt: new Date(),
        acceptedInterestRate: interestRate,
        acceptedProcessingFee: processingFee,
        acceptedEmiAmount: emi,
        acceptedTotalRepayment: totalRepayment,
        status: PlLoanStatus.OFFER_ACCEPTED,
        currentStep: 'BANK_VERIFICATION',
      },
    });

    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'OFFER_ACCEPTED',
      entityType: 'PlLoan',
      entityId: loan.id.toString(),
      outcome: 'SUCCESS',
      newValue: { acceptedTenureDays: tenureDays },
      requestId: randomBytes(16).toString('hex'),
    }).catch(() => { /* non-critical */ });

    return { success: true, message: 'Offer accepted successfully.', nextStep: 'BANK_VERIFICATION' };
  }

  // Pre-approval offer selection (spec sections 6/7): the customer picks a tenure from
  // the admin-configured LenderProductTenure list, and the amount is derived — via the
  // existing ProductCalculationService, not a parallel calculation — from the same
  // multiplier/rounding rules used everywhere else, capped at the lender's pre-approval
  // credit limit (application.lenderApprovedAmount). No PlLoan exists yet at this point.
  async getPreApprovalOffer(lan: string, customerId: bigint) {
    const application = await this.prisma.plApplication.findFirst({ where: { platformLan: lan, customerId } });
    if (!application) throw new NotFoundException('Application not found or does not belong to this customer.');
    if (application.status !== PlApplicationStatus.LENDER_PRE_APPROVED) {
      throw new BadRequestException('No pre-approved offer is available for this application.');
    }
    const { config, multipliers, validTenures, completedLoans } = await this.loadOfferCalculationInputs(application);
    const simulation = this.productCalculationService.simulate(
      completedLoans,
      validTenures[0],
      application.lenderApprovedAmount!.toString(),
      config,
      multipliers,
      validTenures,
    );
    return {
      lan,
      lenderApprovedAmount: application.lenderApprovedAmount!.toNumber(),
      amount: Number(simulation.finalPrincipalAmount),
      allowedTenures: validTenures,
      alreadySelected: Boolean(application.selectedAmount && application.selectedTenure),
      selectedAmount: application.selectedAmount ? application.selectedAmount.toNumber() : null,
      selectedTenure: application.selectedTenure,
    };
  }

  async selectPreApprovalOffer(lan: string, customerId: bigint, tenureDays: number) {
    const application = await this.prisma.plApplication.findFirst({ where: { platformLan: lan, customerId } });
    if (!application) throw new NotFoundException('Application not found or does not belong to this customer.');
    if (application.status !== PlApplicationStatus.LENDER_PRE_APPROVED) {
      throw new BadRequestException('No pre-approved offer is available to select for this application.');
    }
    if (application.selectedAmount && application.selectedTenure) {
      throw new BadRequestException('An offer has already been selected for this application.');
    }

    const { config, multipliers, validTenures, completedLoans } = await this.loadOfferCalculationInputs(application);
    const simulation = this.productCalculationService.simulate(
      completedLoans,
      tenureDays,
      application.lenderApprovedAmount!.toString(),
      config,
      multipliers,
      validTenures,
    );

    // application.status intentionally stays LENDER_PRE_APPROVED here — selectedAmount/
    // selectedTenure being set is what tells nextPermittedStep the offer has already been
    // picked (see customer.service.ts) and to show "processing" instead of the offer picker.
    // The final decision (async lender result) is what moves status to PENDING_CREDIT_REVIEW.
    const selectedAt = new Date();
    await this.prisma.plApplication.update({
      where: { id: application.id },
      data: {
        selectedAmount: new Prisma.Decimal(simulation.finalPrincipalAmount),
        selectedTenure: tenureDays,
        selectedAt,
      },
    });

    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'PRE_APPROVAL_OFFER_SELECTED',
      entityType: 'PlApplication',
      entityId: application.id.toString(),
      outcome: 'SUCCESS',
      newValue: { selectedAmount: simulation.finalPrincipalAmount, selectedTenure: tenureDays },
      requestId: randomBytes(16).toString('hex'),
    }).catch(() => { /* non-critical */ });

    // Stage a fresh profile push (V2) carrying the selected offer; once acknowledged,
    // the outbox worker auto-requests the final (second) lender decision — see
    // LenderIntegrationService.processUpdate().
    const update = await this.lenderIntegrationOutbox.enqueueUpdateWhenReady(application.id, 2);

    return {
      success: true,
      message: 'Offer selected. Final approval is being requested from the lender.',
      selectedAmount: Number(simulation.finalPrincipalAmount),
      selectedTenure: tenureDays,
      updateEnqueued: update.enqueued,
    };
  }

  private async loadOfferCalculationInputs(application: { id: bigint; customerId: bigint; lenderApprovedAmount: Prisma.Decimal | null; productStrategyVersionId: string | null }) {
    if (!application.lenderApprovedAmount || !application.productStrategyVersionId) {
      throw new BadRequestException('Pre-approval credit limit is missing for this application.');
    }
    const productVersion = await this.prisma.lenderProductVersion.findUnique({
      where: { id: application.productStrategyVersionId },
      include: { multipliers: true, tenures: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!productVersion) throw new BadRequestException('Allocated product configuration is missing.');
    const validTenures = productVersion.tenures.map((t) => t.tenure);
    if (validTenures.length === 0) throw new BadRequestException('The allocated product has no configured tenure options.');
    const completedLoans = await this.prisma.plLoan.count({ where: { customerId: application.customerId, status: 'DISBURSED' } });
    return { config: productVersion as any, multipliers: productVersion.multipliers, validTenures, completedLoans };
  }

  async saveAddress(lan: string, customerId: bigint, payload: any) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

    if (loan.digilockerStatus !== 'VERIFIED') {
      throw new BadRequestException('Aadhaar verification not completed');
    }

    const updateData: Prisma.PlLoanUpdateInput = {
      addressConfirmed: true,
      addressConfirmedAt: new Date(),
      status: loan.status === PlLoanStatus.OFFER_ACCEPTED ? PlLoanStatus.ADDRESS_CONFIRMED : loan.status,
    };

    if (payload.sameAsPermanent) {
      updateData.addressSameAsPermanent = true;
      // Copy from permanent Aadhaar address
      updateData.currentAddrLine1 = loan.aadhaarAddrLine1;
      updateData.currentAddrLine2 = loan.aadhaarAddrLine2;
      updateData.currentAddrLandmark = loan.aadhaarLandmark;
      updateData.currentAddrLocality = loan.aadhaarLocality;
      updateData.currentAddrDistrict = loan.aadhaarDistrict;
      updateData.currentAddrCity = loan.aadhaarCity;
      updateData.currentAddrState = loan.aadhaarState;
      updateData.currentAddrCountry = loan.aadhaarCountry;
      updateData.currentAddrPincode = loan.aadhaarPincode;
      updateData.currentAddrProofType = 'AADHAAR';
    } else {
      if (!payload.currentAddress) {
        throw new BadRequestException('Current address details missing');
      }
      updateData.addressSameAsPermanent = false;
      updateData.currentAddrLine1 = payload.currentAddress.addressLine1;
      updateData.currentAddrLine2 = payload.currentAddress.addressLine2;
      updateData.currentAddrLandmark = payload.currentAddress.landmark;
      updateData.currentAddrLocality = payload.currentAddress.locality;
      updateData.currentAddrDistrict = payload.currentAddress.district;
      updateData.currentAddrCity = payload.currentAddress.city;
      updateData.currentAddrState = payload.currentAddress.state;
      updateData.currentAddrCountry = payload.currentAddress.country || 'India';
      updateData.currentAddrPincode = payload.currentAddress.pincode;
      updateData.currentAddrResidenceSince = payload.currentAddress.residenceSince;
      updateData.currentAddrProofType = payload.currentAddress.addressProofType;
      updateData.currentAddrDocumentId = payload.currentAddress.documentId;
    }

    updateData.currentStep = 'BANK_VERIFICATION';

    await this.prisma.plLoan.update({
      where: { id: loan.id },
      data: updateData,
    });

    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'ADDRESS_CONFIRMED',
      entityType: 'PlLoan',
      entityId: loan.id.toString(),
      outcome: 'SUCCESS',
      newValue: { sameAsPermanent: payload.sameAsPermanent },
      requestId: randomBytes(16).toString('hex'),
    }).catch(() => { /* non-critical */ });

    return { success: true, message: 'Address confirmed.', nextStep: 'BANK_VERIFICATION' };
  }

  async initiateDigilocker(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    
    if (loan.digilockerStatus === 'VERIFIED') {
      return { success: true, message: 'Already verified' };
    }

    // Reuse an in-flight session instead of opening a fresh DigiTap link on every click —
    // mirrors the same fix applied to the onboarding-stage initiate() in
    // CustomerAadhaarKycService, for the identical "clicked twice / came back later" bug.
    const initiationTtlMs = 15 * 60 * 1000;
    if (
      loan.digilockerStatus === 'INITIATED' &&
      loan.digilockerConsentAt &&
      Date.now() - loan.digilockerConsentAt.getTime() < initiationTtlMs
    ) {
      const stored = this.readStoredDigilockerInitiation(loan.digilockerRawResponse);
      if (stored?.verificationUrl) {
        return {
          success: true,
          data: {
            lan,
            transactionId: stored.transactionId || loan.digilockerSessionId,
            environment: process.env.DIGITAP_ENV || 'UAT',
            url: stored.verificationUrl,
            kycUrl: stored.kycUrl || stored.verificationUrl,
            clientId: process.env.DIGITAP_CLIENT_ID,
            serviceId: process.env.DIGITAP_DIGILOCKER_SERVICE_ID || '46',
            status: 'INITIATED',
            resumed: true,
          },
        };
      }
    }

    const uniqueId = `${lan}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const response = await this.digitapService.generateDigitapDigilockerUrl({
      uid: uniqueId,
      mobile: loan.customer?.mobileNumber || undefined,
      emailId: loan.customer?.email || undefined,
      firstName: loan.customer?.firstName || undefined,
      lastName: loan.customer?.lastName || undefined,
    });

    const digilockerExpiresAt = new Date(Date.now() + initiationTtlMs).toISOString();

    await this.prisma.$transaction(async (tx) => {
      await tx.plLoan.update({
        where: { id: loan.id },
        data: {
          digilockerStatus: 'INITIATED',
          digilockerSessionId: response.transactionId,
          digilockerReference: uniqueId,
          digilockerConsentAt: new Date(),
          currentStep: 'DIGILOCKER_KYC',
          digilockerRawResponse: JSON.stringify({ verificationUrl: response.url, kycUrl: response.kycUrl, transactionId: response.transactionId, expiresAt: digilockerExpiresAt }),
        },
      });

      await tx.kycVerificationStatus.upsert({
        where: { customerId },
        create: {
          customerId,
          aadhaarStatus: 'INITIATED',
          aadhaarTransactionId: response.transactionId,
          aadhaarUniqueId: uniqueId,
          aadhaarApiRequest: JSON.stringify({ uid: uniqueId }),
          aadhaarApiResponse: JSON.stringify(response.rawResponse),
        },
        update: {
          aadhaarStatus: 'INITIATED',
          aadhaarTransactionId: response.transactionId,
          aadhaarUniqueId: uniqueId,
          aadhaarApiRequest: JSON.stringify({ uid: uniqueId }),
          aadhaarApiResponse: JSON.stringify(response.rawResponse),
        },
      });
    });

    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'DIGILOCKER_INITIATED',
      entityType: 'PlLoan',
      entityId: loan.id.toString(),
      outcome: 'SUCCESS',
      requestId: randomBytes(16).toString('hex'),
    }).catch(() => {});

    return {
      success: true,
      data: {
        lan,
        transactionId: response.transactionId,
        environment: process.env.DIGITAP_ENV || 'UAT',
        url: response.url,
        kycUrl: response.kycUrl,
        clientId: process.env.DIGITAP_CLIENT_ID,
        serviceId: process.env.DIGITAP_DIGILOCKER_SERVICE_ID || '46',
        status: 'INITIATED',
      },
    };
  }

  async getDigilockerStatus(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    
    // Auto-fetch if initiated and we want to double check provider (optional)
    // but the instruction says "optionally call get-digilocker-details" 
    // We'll rely on the frontend explicitly calling fetch-details or just the webhook.
    
    const response = {
      lan,
      status: loan.digilockerStatus || 'NOT_STARTED',
      transactionId: loan.digilockerSessionId,
      maskedAadhaar: loan.aadhaarMaskedNumber,
      verifiedAt: loan.digilockerVerifiedAt,
      name: loan.aadhaarVerifiedName,
      gender: loan.aadhaarGender,
      dateOfBirth: loan.aadhaarDateOfBirth,
      careOf: loan.aadhaarCareOf,
    };

    if (loan.aadhaarAddrLine1 || loan.aadhaarCity) {
      Object.assign(response, {
        permanentAddress: {
          addressLine1: loan.aadhaarAddrLine1,
          addressLine2: loan.aadhaarAddrLine2,
          landmark: loan.aadhaarLandmark,
          locality: loan.aadhaarLocality,
          district: loan.aadhaarDistrict,
          city: loan.aadhaarCity,
          state: loan.aadhaarState,
          country: loan.aadhaarCountry,
          pincode: loan.aadhaarPincode,
          formattedAddress: loan.aadhaarFormattedAddr,
          verified: true,
          source: 'DIGITAP_DIGILOCKER',
        }
      });
    }
    
    return { success: true, data: response };
  }

  async fetchDigilockerDetails(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    const transactionId = loan.digilockerSessionId;
    
    if (!transactionId) {
      throw new BadRequestException('No active DigiLocker transaction');
    }

    const providerResponse = await this.digitapService.getDigitapDigilockerDetails(transactionId);
    await this.persistVerifiedDigilockerDetails(loan.id, customerId, providerResponse, { manualFetch: true });

    return this.getDigilockerStatus(lan, customerId);
  }

  async handleDigilockerWebhook(transactionId: string, status: string, payload: any, metadata: any) {
    let loan = await this.prisma.plLoan.findFirst({
      where: { digilockerSessionId: transactionId },
      include: { customer: true, application: true },
    });

    if (!loan) {
      const kycStatus = await this.prisma.kycVerificationStatus.findFirst({
        where: { aadhaarTransactionId: transactionId },
        include: { customer: true },
      });
      if (kycStatus) {
        loan = await this.prisma.plLoan.findFirst({
          where: { customerId: kycStatus.customerId },
          include: { customer: true, application: true },
          orderBy: { id: 'desc' },
        });
      }
    }

    if (!loan) {
      this.logger.warn(`Webhook received for unknown transactionId: ${transactionId}`);
      return {
        status: 'Ignored',
        acknowledged: true,
        processed: false,
        reason: 'TRANSACTION_NOT_FOUND',
      };
    }

    if (loan.digilockerStatus === 'VERIFIED') {
      this.logger.log(`Ignoring webhook for already verified transaction: ${transactionId}`);
      this.auditLogs.record({
        actorUserId: null,
        module: 'LOAN',
        action: 'DIGILOCKER_DUPLICATE_WEBHOOK_IGNORED',
        entityType: 'PlLoan',
        entityId: loan.id.toString(),
        outcome: 'SUCCESS',
        requestId: randomBytes(16).toString('hex'),
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      }).catch(() => {});

      return {
        status: 'Success',
        acknowledged: true,
        processed: true,
        duplicate: true,
      };
    }

    if (status === 'VERIFIED') {
      const rawModel = payload?.data || payload?.model || payload;
      const hasFullDetails = Boolean(
        rawModel?.maskedAdharNumber ||
        rawModel?.maskedAadhaar ||
        rawModel?.name ||
        rawModel?.address
      );

      let detailsResponse = payload;
      if (!hasFullDetails) {
        detailsResponse = await this.digitapService.getDigitapDigilockerDetails(transactionId);
      }

      await this.persistVerifiedDigilockerDetails(loan.id, loan.customerId, detailsResponse, metadata);

      return {
        status: 'Success',
        acknowledged: true,
        processed: true,
        duplicate: false,
      };
    } else {
      const failStatus = status === 'EXPIRED' ? 'EXPIRED' : status === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
      const sanitized = sanitizeDigitapPayload(payload);

      await this.prisma.$transaction(async (tx) => {
        await tx.plLoan.update({
          where: { id: loan.id },
          data: {
            digilockerStatus: failStatus,
            digilockerRawResponse: JSON.stringify(sanitized),
            currentStep: 'DIGILOCKER_KYC',
          },
        });
        await tx.kycVerificationStatus.updateMany({
          where: { customerId: loan.customerId },
          data: {
            aadhaarStatus: failStatus === 'EXPIRED' ? 'FAILED' : (failStatus as any),
            aadhaarWebhookResponse: JSON.stringify(sanitized),
          },
        });
      });

      this.auditLogs.record({
        actorUserId: null,
        module: 'LOAN',
        action: `DIGILOCKER_${failStatus}`,
        entityType: 'PlLoan',
        entityId: loan.id.toString(),
        outcome: 'FAILURE',
        requestId: randomBytes(16).toString('hex'),
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      }).catch(() => {});

      return {
        status: 'Success',
        acknowledged: true,
        processed: true,
        duplicate: false,
      };
    }
  }

  async persistVerifiedDigilockerDetails(loanId: bigint, customerId: bigint, providerResponse: any, metadata: any) {
    const loan = await this.prisma.plLoan.findUnique({
      where: { id: loanId },
      include: { customer: true },
    });

    if (!loan) {
      throw new NotFoundException(`Loan ${loanId} not found`);
    }

    if (loan.digilockerStatus === 'VERIFIED') {
      return; // Do not overwrite verified data
    }

    const normalized = normalizeDigitapDetails(providerResponse);
    if (normalized.status !== 'VERIFIED') {
      return;
    }

    const rawModel = providerResponse?.model || providerResponse?.data || providerResponse || {};
    const sanitizedResponse = sanitizeDigitapPayload(providerResponse);
    const sanitizedRawResponseStr = JSON.stringify(sanitizedResponse);

    // Save physical document files (PDF/XML/Photo) before DB transaction
    const savedFiles = await this.processAndStoreDigitapDocuments(
      customerId,
      loan.applicationId,
      loan.lan,
      normalized.transactionId || loan.digilockerSessionId || 'UNKNOWN',
      rawModel
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.plLoan.update({
          where: { id: loanId },
          data: {
            digilockerStatus: 'VERIFIED',
            aadhaarMaskedNumber: normalized.maskedAadhaar,
            aadhaarLastFour: normalized.aadhaarLastFour,
            aadhaarVerifiedName: normalized.name,
            aadhaarDateOfBirth: normalized.dateOfBirth,
            aadhaarGender: normalized.gender,
            aadhaarCareOf: normalized.careOf,
            aadhaarAddrLine1: normalized.permanentAddress?.addressLine1,
            aadhaarAddrLine2: normalized.permanentAddress?.addressLine2,
            aadhaarLandmark: normalized.permanentAddress?.landmark,
            aadhaarLocality: normalized.permanentAddress?.locality,
            aadhaarDistrict: normalized.permanentAddress?.district,
            aadhaarCity: normalized.permanentAddress?.city,
            aadhaarState: normalized.permanentAddress?.state,
            aadhaarCountry: normalized.permanentAddress?.country || 'India',
            aadhaarPincode: normalized.permanentAddress?.pincode,
            aadhaarFormattedAddr: normalized.permanentAddress?.formattedAddress,
            digilockerVerifiedAt: new Date(),
            digilockerRawResponse: sanitizedRawResponseStr,
            currentStep: 'ADDRESS_CONFIRMATION',
            status: PlLoanStatus.KYC_IN_PROGRESS,
          },
        });

        await tx.kycVerificationStatus.upsert({
          where: { customerId },
          create: {
            customerId,
            aadhaarStatus: 'VERIFIED',
            aadhaarTransactionId: normalized.transactionId || loan.digilockerSessionId,
            aadhaarUniqueId: normalized.uniqueId || loan.digilockerReference,
            aadhaarName: normalized.name,
            aadhaarMaskedNumber: normalized.maskedAadhaar,
            aadhaarDob: normalized.dateOfBirth,
            aadhaarAddress: normalized.permanentAddress?.formattedAddress,
            aadhaarApiResponse: sanitizedRawResponseStr,
            aadhaarWebhookResponse: sanitizedRawResponseStr,
          },
          update: {
            aadhaarStatus: 'VERIFIED',
            aadhaarTransactionId: normalized.transactionId || loan.digilockerSessionId,
            aadhaarUniqueId: normalized.uniqueId || loan.digilockerReference,
            aadhaarName: normalized.name,
            aadhaarMaskedNumber: normalized.maskedAadhaar,
            aadhaarDob: normalized.dateOfBirth,
            aadhaarAddress: normalized.permanentAddress?.formattedAddress,
            aadhaarApiResponse: sanitizedRawResponseStr,
            aadhaarWebhookResponse: sanitizedRawResponseStr,
          },
        });

        // Safe profile updates for customer
        if (normalized.permanentAddress) {
          await tx.customer.update({
            where: { id: customerId },
            data: {
              residentialPincode: normalized.permanentAddress.pincode || undefined,
              residentialCity: normalized.permanentAddress.city || undefined,
              residentialState: normalized.permanentAddress.state || undefined,
              lastActivityAt: new Date(),
            },
          });
        }
      });
    } catch (dbErr) {
      // Clean up orphaned document files if DB transaction fails
      for (const filePath of savedFiles) {
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (_e) {
            // Ignore cleanup errors
          }
        }
      }
      throw dbErr;
    }

    // Name Mismatch Audit
    if (loan.customer?.fullName && normalized.name) {
      const cleanCustName = loan.customer.fullName.toUpperCase().replace(/[^A-Z]/g, '');
      const cleanAadhName = normalized.name.toUpperCase().replace(/[^A-Z]/g, '');
      if (cleanCustName !== cleanAadhName && !cleanCustName.includes(cleanAadhName) && !cleanAadhName.includes(cleanCustName)) {
        this.auditLogs.record({
          actorUserId: null,
          module: 'LOAN',
          action: 'AADHAAR_PAN_NAME_MISMATCH',
          entityType: 'PlLoan',
          entityId: loanId.toString(),
          outcome: 'FAILURE',
          requestId: randomBytes(16).toString('hex'),
        }).catch(() => {});
      }
    }

    // DOB Mismatch Audit
    if (loan.customer?.dateOfBirth && normalized.dateOfBirth) {
      const custDobStr = loan.customer.dateOfBirth.toISOString().slice(0, 10);
      const aadhDobStr = normalized.dateOfBirth.toISOString().slice(0, 10);
      if (custDobStr !== aadhDobStr) {
        this.auditLogs.record({
          actorUserId: null,
          module: 'LOAN',
          action: 'AADHAAR_PAN_DOB_MISMATCH',
          entityType: 'PlLoan',
          entityId: loanId.toString(),
          outcome: 'FAILURE',
          requestId: randomBytes(16).toString('hex'),
        }).catch(() => {});
      }
    }

    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'DIGILOCKER_VERIFIED',
      entityType: 'PlLoan',
      entityId: loanId.toString(),
      outcome: 'SUCCESS',
      requestId: randomBytes(16).toString('hex'),
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    }).catch(() => {});
  }

  private async processAndStoreDigitapDocuments(
    customerId: bigint,
    applicationId: bigint,
    lan: string,
    transactionId: string,
    rawModel: any
  ): Promise<string[]> {
    const createdFiles: string[] = [];
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const relativeSubDir = path.join('uploads', 'customer-documents', 'digilocker', String(year), month);
    const targetDir = path.join(process.cwd(), relativeSubDir);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const docSources: Array<{
      type: PlDocumentType;
      source: string | null;
      ext: string;
      mimeType: string;
    }> = [
      {
        type: PlDocumentType.CUSTOMER_LIVE_PHOTO,
        source: rawModel?.image || rawModel?.photo || rawModel?.imageBase64 || null,
        ext: 'jpg',
        mimeType: 'image/jpeg',
      },
      {
        type: PlDocumentType.AADHAAR_CARD,
        source: rawModel?.pdfLink || rawModel?.pdf_url || rawModel?.pdfData || null,
        ext: 'pdf',
        mimeType: 'application/pdf',
      },
      {
        type: PlDocumentType.OTHER,
        source: rawModel?.xmlLink || rawModel?.xml_url || rawModel?.xmlResponse || rawModel?.link || null,
        ext: 'xml',
        mimeType: 'application/xml',
      },
    ];

    for (const doc of docSources) {
      if (!doc.source || doc.source === '[REMOVED]') continue;

      try {
        const buffer = await this.resolveDigitapDocumentBuffer(doc.source);
        if (!buffer || buffer.length === 0 || buffer.length > 10 * 1024 * 1024) continue;

        const rand = randomBytes(4).toString('hex');
        const fileName = `aadhaar-${lan}-${Date.now()}-${rand}.${doc.ext}`;
        const filePath = path.join(targetDir, fileName);
        const fileUrl = `/${relativeSubDir.replace(/\\/g, '/')}/${fileName}`;

        fs.writeFileSync(filePath, buffer);
        createdFiles.push(filePath);

        const existingDoc = await this.prisma.plCustomerDocument.findFirst({
          where: {
            customerId,
            applicationId,
            documentType: doc.type,
            source: 'DIGITAP_DIGILOCKER',
          },
        });

        const metadataJson = JSON.stringify({
          lan,
          transactionId,
          provider: 'DIGITAP',
          mimeType: doc.mimeType,
          storedAt: new Date().toISOString(),
        });

        if (existingDoc) {
          await this.prisma.plCustomerDocument.update({
            where: { id: existingDoc.id },
            data: {
              fileName,
              filePath,
              fileUrl,
              fileSize: buffer.length,
              mimeType: doc.mimeType,
              status: PlDocumentStatus.VERIFIED,
              metadataJson,
              updatedAt: new Date(),
            },
          });
        } else {
          await this.prisma.plCustomerDocument.create({
            data: {
              customerId,
              applicationId,
              documentType: doc.type,
              applicantType: 'BORROWER',
              status: PlDocumentStatus.VERIFIED,
              fileName,
              originalFileName: fileName,
              filePath,
              fileUrl,
              mimeType: doc.mimeType,
              fileSize: buffer.length,
              source: 'DIGITAP_DIGILOCKER',
              metadataJson,
            },
          });
        }
      } catch (err: any) {
        this.logger.error(`Failed storing DigiLocker document (${doc.type}): ${err.message}`);
      }
    }

    return createdFiles;
  }

  private async resolveDigitapDocumentBuffer(source: string): Promise<Buffer | null> {
    if (!source) return null;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      const parsedUrl = new URL(source);
      if (['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'].includes(parsedUrl.hostname)) {
        throw new BadRequestException('Invalid internal document URL');
      }

      const response = await axios.get(source, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxContentLength: 10 * 1024 * 1024,
      });
      return Buffer.from(response.data);
    }

    const base64Data = source.replace(/^data:[^;]+;base64,/, '').trim();
    return Buffer.from(base64Data, 'base64');
  }

  async verifyBankAccount(lan: string, customerId: bigint, payload: any, metadata?: any) {
    await this.findLoanByLanAndCustomer(lan, customerId);
    return this.externalApiService.verifyCustomerBankAccount(
      lan,
      payload,
      { customerId: String(customerId) },
      metadata,
    );
  }

  async generateKfs(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    return {
      success: true,
      message: 'KFS document available',
      kfs: {
        lan: loan.lan,
        documentUrl: loan.kfsDocumentId || null,
        kfsAccepted: loan.kfsAccepted,
      },
    };
  }

  async acceptKfs(lan: string, customerId: bigint, payload: any) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

    if (!loan.bankVerified) {
      throw new BadRequestException('Please verify bank account before accepting Key Fact Statement (KFS).');
    }

    const updatedLoan = await this.prisma.plLoan.update({
      where: { id: loan.id },
      data: {
        kfsAccepted: true,
        kfsAcceptedAt: new Date(),
        kfsConsentText:
          payload?.consentText ||
          'I have read and accept the KFS, charges, repayment obligation and penal charge terms.',
        currentStep: 'EMANDATE',
      },
    });

    this.auditLogs
      .record({
        actorUserId: null,
        module: 'LOAN',
        action: 'KFS_ACCEPTED',
        entityType: 'PlLoan',
        entityId: loan.id.toString(),
        outcome: 'SUCCESS',
        requestId: randomBytes(16).toString('hex'),
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Key Fact Statement accepted successfully',
      nextStep: 'EMANDATE',
      loan: {
        lan: updatedLoan.lan,
        kfsAccepted: updatedLoan.kfsAccepted,
        currentStep: 'EMANDATE',
      },
    };
  }

  private resolveMandateConfiguration(loan: any, requestedMandateType?: string) {
    const approvedAmount = loan.approvedAmount ? Number(loan.approvedAmount) : 0;
    const acceptedTotalRepayment = loan.acceptedTotalRepayment ? Number(loan.acceptedTotalRepayment) : approvedAmount;

    const amount = Math.max(acceptedTotalRepayment, approvedAmount, 100);
    const amountRule = this.configService.get<string>('EASEBUZZ_MANDATE_AMOUNT_RULE') || 'MAX';
    const frequency = this.configService.get<string>('EASEBUZZ_MANDATE_DEFAULT_FREQUENCY') || 'monthly';
    const configMandateType = this.configService.get<string>('EASEBUZZ_MANDATE_DEFAULT_TYPE') || 'ENACH';
    
    let mandateType = (requestedMandateType || configMandateType) as PlMandateType;
    if (mandateType !== 'UPI' && mandateType !== 'ENACH') {
      mandateType = 'ENACH' as PlMandateType;
    }

    const startDateObj = new Date();
    startDateObj.setDate(startDateObj.getDate() + 1);
    const startDate = startDateObj.toISOString().split('T')[0];

    const endDateObj = new Date(startDateObj);
    const tenureDays = loan.acceptedTenureDays || 365;
    endDateObj.setDate(endDateObj.getDate() + tenureDays + 30);
    const endDate = endDateObj.toISOString().split('T')[0];

    return {
      mandateType,
      amount,
      amountRule,
      frequency,
      startDate,
      endDate,
      paymentModes: mandateType === 'UPI' ? ['UPIAD'] : ['EN'],
    };
  }

  private generateUniqueTransactionId(lan: string): string {
    const suffix = String(lan || '').slice(-6).replace(/[^a-zA-Z0-9]/g, '');
    const rand = randomBytes(3).toString('hex').toUpperCase();
    const timestamp = Date.now().toString().slice(-6);
    const txId = `PLM_${suffix}_${timestamp}_${rand}`;
    return txId.slice(0, 40);
  }

  private normalizeEasebuzzMandateStatus(rawStatus: string): PlMandateStatus {
    const s = String(rawStatus || '').trim().toLowerCase();
    if (s === 'authorized' || s === 'completed' || s === 'success') return PlMandateStatus.AUTHORIZED;
    if (s === 'initiated') return PlMandateStatus.INITIATED;
    if (s === 'requested') return PlMandateStatus.REQUESTED;
    if (s === 'created') return PlMandateStatus.CREATED;
    if (s === 'failed') return PlMandateStatus.FAILED;
    if (s === 'rejected') return PlMandateStatus.REJECTED;
    if (s === 'cancelled' || s === 'cancelling') return PlMandateStatus.CANCELLED;
    if (s === 'user_cancelled') return PlMandateStatus.USER_CANCELLED;
    if (s === 'expired') return PlMandateStatus.EXPIRED;
    if (s === 'revoked') return PlMandateStatus.REVOKED;
    if (s === 'paused') return PlMandateStatus.PAUSED;
    if (s === 'dropped') return PlMandateStatus.DROPPED;
    if (s === 'bounced') return PlMandateStatus.BOUNCED;
    return PlMandateStatus.UNKNOWN;
  }

  async initiateMandate(lan: string, customerId: bigint, forceNew: boolean = false, mandateTypeReq?: string, _metadata?: { ipAddress?: string; userAgent?: string }) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

    // Validate step prerequisites
    if (!loan.acceptedTenureDays) {
      throw new BadRequestException('Please accept loan offer before setting up e-Mandate.');
    }

    // --- Aadhaar KYC gate ---
    // Primary check: pl_loans.digilocker_status
    // Fallback check: kyc_verification_status.aadhaarStatus — covers cases where KYC was
    // completed during onboarding (stored in kycVerificationStatus) but the loan record's
    // digilocker_status was never synced (e.g. customer 45 / FTPL00000047).
    let isKycVerified = loan.digilockerStatus === 'VERIFIED';
    if (!isKycVerified) {
      const kycRecord = await this.prisma.kycVerificationStatus.findUnique({
        where: { customerId },
        select: { aadhaarStatus: true, aadhaarName: true, aadhaarMaskedNumber: true, aadhaarDob: true, aadhaarAddress: true, updatedAt: true },
      });
      if (kycRecord?.aadhaarStatus === 'VERIFIED') {
        isKycVerified = true;
        // Back-fill the loan record so future checks (and the journey API) stay consistent.
        await this.prisma.plLoan.update({
          where: { id: loan.id },
          data: {
            digilockerStatus: 'VERIFIED',
            digilockerVerifiedAt: kycRecord.updatedAt ?? new Date(),
            ...(kycRecord.aadhaarName ? { aadhaarVerifiedName: kycRecord.aadhaarName } : {}),
            ...(kycRecord.aadhaarMaskedNumber ? { aadhaarMaskedNumber: kycRecord.aadhaarMaskedNumber, aadhaarLastFour: kycRecord.aadhaarMaskedNumber.slice(-4) } : {}),
            ...(kycRecord.aadhaarDob ? { aadhaarDateOfBirth: kycRecord.aadhaarDob } : {}),
            ...(kycRecord.aadhaarAddress ? { aadhaarFormattedAddr: kycRecord.aadhaarAddress } : {}),
          },
        });
        this.logger.log(`[initiateMandate] Back-filled digilockerStatus=VERIFIED on loan ${loan.id} (${lan}) from kycVerificationStatus for customerId=${customerId}`);
      }
    }

    if (!isKycVerified) {
      throw new BadRequestException('Please complete Aadhaar KYC verification before setting up e-Mandate.');
    }
    // --- end Aadhaar KYC gate ---

    // --- Address confirmation gate ---
    // If the address hasn't been confirmed via the UI, try to auto-confirm it from the
    // Aadhaar data that was back-filled above (or was already on the loan). This covers
    // customers (e.g. customer 45) who have bank+KFS completed but skipped the address screen
    // because their pl_loans.digilocker_status was NULL at that time.
    if (!loan.addressConfirmed) {
      // Determine the best available address data from the loan record or KYC table
      const hasLoanAadhaarAddr = !!(loan.aadhaarAddrLine1 || loan.aadhaarCity || loan.aadhaarFormattedAddr);
      let addressAutoConfirmed = false;

      if (isKycVerified && hasLoanAadhaarAddr) {
        // Build address fields from what's available on the loan (may only have formatted addr)
        const addrUpdate: Prisma.PlLoanUpdateInput = {
          addressConfirmed: true,
          addressConfirmedAt: new Date(),
          addressSameAsPermanent: true,
          currentAddrProofType: 'AADHAAR',
          currentAddrLine1: loan.aadhaarAddrLine1 ?? loan.aadhaarFormattedAddr ?? null,
          currentAddrLine2: loan.aadhaarAddrLine2 ?? null,
          currentAddrLandmark: loan.aadhaarLandmark ?? null,
          currentAddrLocality: loan.aadhaarLocality ?? null,
          currentAddrDistrict: loan.aadhaarDistrict ?? null,
          currentAddrCity: loan.aadhaarCity ?? null,
          currentAddrState: loan.aadhaarState ?? null,
          currentAddrCountry: loan.aadhaarCountry ?? 'India',
          currentAddrPincode: loan.aadhaarPincode ?? null,
        };
        await this.prisma.plLoan.update({ where: { id: loan.id }, data: addrUpdate });
        addressAutoConfirmed = true;
        this.logger.log(`[initiateMandate] Auto-confirmed address (same as Aadhaar) for loan ${loan.id} (${lan}), customerId=${customerId}`);
      } else if (isKycVerified) {
        // Loan has no Aadhaar address fields yet — check kycVerificationStatus for the formatted address
        const kycAddr = await this.prisma.kycVerificationStatus.findUnique({
          where: { customerId },
          select: { aadhaarAddress: true },
        });
        if (kycAddr?.aadhaarAddress) {
          await this.prisma.plLoan.update({
            where: { id: loan.id },
            data: {
              addressConfirmed: true,
              addressConfirmedAt: new Date(),
              addressSameAsPermanent: true,
              currentAddrProofType: 'AADHAAR',
              currentAddrLine1: kycAddr.aadhaarAddress,
              currentAddrCountry: 'India',
            },
          });
          addressAutoConfirmed = true;
          this.logger.log(`[initiateMandate] Auto-confirmed address from kycVerificationStatus for loan ${loan.id} (${lan}), customerId=${customerId}`);
        }
      }

      if (!addressAutoConfirmed) {
        throw new BadRequestException('Please confirm your residential address before setting up e-Mandate.');
      }
    }
    // --- end Address confirmation gate ---
    if (!loan.bankVerified) {
      throw new BadRequestException('Please verify your bank account before setting up e-Mandate.');
    }
    if (!loan.kfsAccepted) {
      throw new BadRequestException('Please accept Key Fact Statement (KFS) before setting up e-Mandate.');
    }

    // Check if mandate is already authorized
    const latestMandate = (loan as any).mandates?.[0];
    if (loan.mandateCompleted || latestMandate?.status === 'AUTHORIZED' || latestMandate?.status === 'COMPLETED') {
      return {
        success: true,
        message: 'e-Mandate is already authorized.',
        data: {
          status: 'AUTHORIZED',
          completed: true,
          transactionId: latestMandate?.merchantTransactionId || loan.mandateProviderRef || `PLM_${loan.lan}`,
          mandateType: latestMandate?.mandateType || 'ENACH',
          portalUrl: null,
          amount: latestMandate?.amount ? Number(latestMandate.amount).toFixed(2) : Number(loan.approvedAmount).toFixed(2),
          frequency: latestMandate?.frequency || 'monthly',
          startDate: latestMandate?.startDate ? new Date(latestMandate.startDate).toISOString().split('T')[0] : null,
          endDate: latestMandate?.endDate ? new Date(latestMandate.endDate).toISOString().split('T')[0] : null,
          pollAfterSeconds: 5,
        },
      };
    }

    // Check for existing usable active mandate attempt (within last 1 hour), unless forceNew is requested
    if (
      !forceNew &&
      latestMandate &&
      ['ACCESS_KEY_GENERATED', 'INITIATED', 'REQUESTED', 'CREATED'].includes(latestMandate.status) &&
      latestMandate.portalUrl &&
      latestMandate.createdAt &&
      (Date.now() - new Date(latestMandate.createdAt).getTime() < 3600000)
    ) {
      let resumedPortalUrl = latestMandate.portalUrl;
      if (resumedPortalUrl && resumedPortalUrl.includes('testpay.easebuzz.in')) {
        resumedPortalUrl = resumedPortalUrl.replace('testpay.easebuzz.in', 'pay.easebuzz.in');
      }

      return {
        success: true,
        message: 'Resuming active mandate authorization session.',
        data: {
          status: latestMandate.status,
          completed: false,
          transactionId: latestMandate.merchantTransactionId,
          mandateType: latestMandate.mandateType,
          accessKey: latestMandate.accessKey,
          portalUrl: resumedPortalUrl,
          amount: Number(latestMandate.amount).toFixed(2),
          frequency: latestMandate.frequency,
          startDate: new Date(latestMandate.startDate).toISOString().split('T')[0],
          endDate: new Date(latestMandate.endDate).toISOString().split('T')[0],
          pollAfterSeconds: 5,
          bank: {
            accountHolderName: latestMandate.accountHolderName || loan.bankVerification?.providerBeneficiaryName || loan.bankVerification?.accountHolderName || '—',
            maskedAccountNumber: latestMandate.accountNumberMasked || loan.bankAccountMasked || loan.bankVerification?.accountNumberMasked || '—',
            ifscCode: latestMandate.ifscMasked || loan.bankIfsc || loan.bankVerification?.ifscCode || '—',
            bankName: loan.bankName || loan.bankVerification?.bankName || '—',
            accountType: latestMandate.accountType || loan.bankAccountType || 'SAVINGS',
          },
        },
      };
    }

    // Directly fetch bank details from pl_bank_verifications table
    let bankVerification = loan.bankVerification;
    if (!bankVerification) {
      bankVerification = await this.prisma.plBankVerification.findFirst({
        where: { loanId: loan.id },
        orderBy: { createdAt: 'desc' },
      });
    }

    let decryptedAccountNumber: string | undefined = undefined;
    if (bankVerification?.accountNumberEncrypted) {
      try {
        decryptedAccountNumber = decryptBankAccountNumber(bankVerification.accountNumberEncrypted);
      } catch (e) {
        this.logger.warn(`Could not decrypt stored bank account number from pl_bank_verifications: ${(e as any)?.message}`);
      }
    }

    if (!decryptedAccountNumber && bankVerification?.accountNumberMasked) {
      decryptedAccountNumber = bankVerification.accountNumberMasked;
    }
    if (!decryptedAccountNumber && loan.bankAccountMasked) {
      decryptedAccountNumber = loan.bankAccountMasked;
    }

    const config = this.resolveMandateConfiguration(loan, mandateTypeReq);
    const transactionId = this.generateUniqueTransactionId(loan.lan);

    const successUrl = this.configService.get<string>('EASEBUZZ_MANDATE_SUCCESS_URL') || `${this.configService.get('FRONTEND_URL')}/customer/mandate/result`;
    const failureUrl = this.configService.get<string>('EASEBUZZ_MANDATE_FAILURE_URL') || `${this.configService.get('FRONTEND_URL')}/customer/mandate/result`;

    const email = loan.customer?.email || 'customer@fintreefinance.com';
    const phone = loan.customer?.mobileNumber || '9876543210';

    const bankAccHolder = bankVerification?.providerBeneficiaryName || bankVerification?.accountHolderName || loan.bankAccountHolderName || loan.customer?.fullName || undefined;
    const bankIfsc = bankVerification?.ifscCode || loan.bankIfsc || undefined;
    const bankType = bankVerification?.accountType || loan.bankAccountType || 'SAVINGS';

    // Call Easebuzz Autocollect to generate access key
    const accessKeyRes = await this.easebuzzAutocollectService.generateAccessKey({
      transactionId,
      amount: config.amount,
      successUrl,
      failureUrl,
      email,
      phone,
      startDate: config.startDate,
      endDate: config.endDate,
      frequency: config.frequency,
      amountRule: config.amountRule,
      paymentModes: config.paymentModes,
      accountNumber: decryptedAccountNumber,
      ifscCode: bankIfsc,
      accountHolderName: bankAccHolder,
      accountType: bankType,
      subMerchantId: this.configService.get<string>('EASEBUZZ_AUTOCOLLECT_SUB_MERCHANT_ID') || undefined,
      udf1: loan.lan,
      udf2: loan.id.toString(),
      udf3: loan.customerId.toString(),
    });

    const portalUrl = accessKeyRes.portalUrl;

    // Create PlLoanMandate attempt in DB
    const newMandate = await this.prisma.plLoanMandate.create({
      data: {
        loanId: loan.id,
        customerId: loan.customerId.toString(),
        applicationId: loan.applicationId ? loan.applicationId.toString() : null,
        lan: loan.lan,
        provider: PlMandateProvider.EASEBUZZ,
        mandateType: config.mandateType,
        merchantTransactionId: transactionId,
        accessKey: accessKeyRes.accessKey,
        portalUrl: portalUrl,
        status: PlMandateStatus.ACCESS_KEY_GENERATED,
        amount: new Prisma.Decimal(config.amount),
        amountRule: config.amountRule,
        frequency: config.frequency,
        startDate: new Date(config.startDate),
        endDate: new Date(config.endDate),
        accountNumberMasked: loan.bankAccountMasked || loan.bankVerification?.accountNumberMasked || null,
        ifscMasked: bankIfsc || null,
        accountType: bankType,
        accountHolderName: bankAccHolder || null,
        providerRequestJson: JSON.stringify(accessKeyRes.rawResponse || {}),
        initiationCount: (latestMandate?.initiationCount || 0) + 1,
      },
    });

    await this.prisma.plLoan.update({
      where: { id: loan.id },
      data: {
        mandateInitiatedAt: new Date(),
        mandateStatus: 'ACCESS_KEY_GENERATED',
        mandateProviderRef: transactionId,
      },
    });

    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'EASEBUZZ_ACCESS_KEY_GENERATED',
      entityType: 'PlLoanMandate',
      entityId: newMandate.id.toString(),
      outcome: 'SUCCESS',
      newValue: { lan: loan.lan, transactionId, status: 'ACCESS_KEY_GENERATED' },
      requestId: randomBytes(16).toString('hex'),
    }).catch(() => {});

    // Generate Mandate Creation form payload with AES-256-CBC encrypted fields and SHA-512 Authorization hash
    let mandateRegistrationRes: any = null;
    if (decryptedAccountNumber && bankIfsc) {
      try {
        mandateRegistrationRes = await this.easebuzzAutocollectService.createMandateRegistration({
          accessKey: accessKeyRes.accessKey,
          accountNumber: decryptedAccountNumber,
          accountHolderName: bankAccHolder || 'ACCOUNT HOLDER',
          ifscCode: bankIfsc,
          accountType: bankType,
          mandateType: newMandate.mandateType,
        });
      } catch (err: any) {
        this.logger.warn(`Mandate creation payload generation warning: ${err?.message}`);
      }
    }

    return {
      success: true,
      message: 'Mandate authorization initiated successfully.',
      data: {
        status: 'ACCESS_KEY_GENERATED',
        transactionId: newMandate.merchantTransactionId,
        mandateType: newMandate.mandateType,
        accessKey: newMandate.accessKey,
        portalUrl: newMandate.portalUrl,
        amount: Number(newMandate.amount).toFixed(2),
        frequency: newMandate.frequency,
        startDate: newMandate.startDate.toISOString().split('T')[0],
        endDate: newMandate.endDate.toISOString().split('T')[0],
        pollAfterSeconds: Number(this.configService.get('EASEBUZZ_MANDATE_POLL_INTERVAL_SECONDS') || '5'),
        bank: {
          accountHolderName: bankAccHolder || '—',
          maskedAccountNumber: loan.bankAccountMasked || loan.bankVerification?.accountNumberMasked || '—',
          ifscCode: bankIfsc || '—',
          bankName: loan.bankName || loan.bankVerification?.bankName || '—',
          accountType: bankType,
        },
        mandateForm: mandateRegistrationRes?.mandateForm || null,
      },
    };
  }

  async getMandateStatus(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    const activeMandate = (loan as any).mandates?.[0];

    const isAuthorized = loan.mandateCompleted || activeMandate?.status === 'AUTHORIZED' || activeMandate?.status === 'COMPLETED';

    if (!activeMandate) {
      return {
        success: true,
        data: {
          status: isAuthorized ? 'AUTHORIZED' : 'NOT_STARTED',
          completed: Boolean(isAuthorized),
          transactionId: loan.mandateProviderRef || null,
          mandateId: loan.mandateProviderRef || null,
          mandateType: 'ENACH',
          amount: loan.acceptedTotalRepayment ? Number(loan.acceptedTotalRepayment).toFixed(2) : Number(loan.approvedAmount).toFixed(2),
          frequency: 'monthly',
          umrn: null,
          tpvValidationStatus: null,
          authorizedAt: loan.mandateCompletedAt || null,
          lastCheckedAt: new Date().toISOString(),
        },
      };
    }

    return {
      success: true,
      data: {
        status: activeMandate.status,
        completed: Boolean(isAuthorized),
        transactionId: activeMandate.merchantTransactionId,
        mandateId: activeMandate.providerMandateId || null,
        mandateType: activeMandate.mandateType,
        amount: Number(activeMandate.amount).toFixed(2),
        frequency: activeMandate.frequency,
        startDate: activeMandate.startDate ? new Date(activeMandate.startDate).toISOString().split('T')[0] : null,
        endDate: activeMandate.endDate ? new Date(activeMandate.endDate).toISOString().split('T')[0] : null,
        umrn: activeMandate.umrn ? `***${String(activeMandate.umrn).slice(-4)}` : null,
        tpvValidationStatus: activeMandate.tpvValidationStatus || null,
        authorizedAt: activeMandate.authorizedAt || null,
        failedAt: activeMandate.failedAt || null,
        failureReason: activeMandate.failureReason || null,
        lastCheckedAt: activeMandate.lastStatusCheckedAt || activeMandate.updatedAt,
      },
    };
  }

  async refreshMandateStatus(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    const activeMandate = (loan as any).mandates?.[0];

    if (!activeMandate) {
      return this.getMandateStatus(lan, customerId);
    }

    // Rate-limit provider retrieve calls (at most once every 10 seconds per mandate)
    const lastChecked = activeMandate.lastStatusCheckedAt ? new Date(activeMandate.lastStatusCheckedAt).getTime() : 0;
    if (Date.now() - lastChecked < 10000 && activeMandate.status !== 'AUTHORIZED') {
      return this.getMandateStatus(lan, customerId);
    }

    try {
      const providerRes = await this.easebuzzAutocollectService.retrieveMandate(activeMandate.merchantTransactionId);
      const resData = providerRes.data;

      const rawStatus = resData?.status || resData?.mandate_status || resData?.model?.status || '';
      const normalizedStatus = this.normalizeEasebuzzMandateStatus(rawStatus);

      const providerMandateId = resData?.provider_mandate_id || resData?.mandate_id || resData?.id || null;
      const umrn = resData?.umrn || resData?.bank_reference_number || null;
      const failureReason = resData?.failure_reason || resData?.error_desc || null;

      // Do not downgrade an AUTHORIZED mandate to FAILED
      if (activeMandate.status === 'AUTHORIZED' || activeMandate.status === 'COMPLETED') {
        await this.prisma.plLoanMandate.update({
          where: { id: activeMandate.id },
          data: { lastStatusCheckedAt: new Date() },
        });
        return this.getMandateStatus(lan, customerId);
      }

      if (normalizedStatus === PlMandateStatus.AUTHORIZED || normalizedStatus === PlMandateStatus.COMPLETED) {
        await this.prisma.$transaction([
          this.prisma.plLoanMandate.update({
            where: { id: activeMandate.id },
            data: {
              status: PlMandateStatus.AUTHORIZED,
              providerStatus: String(rawStatus),
              providerMandateId: providerMandateId ? String(providerMandateId) : activeMandate.providerMandateId,
              umrn: umrn ? String(umrn) : activeMandate.umrn,
              authorizedAt: activeMandate.authorizedAt || new Date(),
              lastStatusCheckedAt: new Date(),
              providerResponseJson: JSON.stringify(providerRes.sanitizedResponse || {}),
            },
          }),
          this.prisma.plLoan.update({
            where: { id: loan.id },
            data: {
              mandateCompleted: true,
              mandateCompletedAt: new Date(),
              mandateStatus: 'AUTHORIZED',
              mandateProviderRef: providerMandateId ? String(providerMandateId) : activeMandate.merchantTransactionId,
              currentStep: 'ESIGN',
            },
          }),
        ]);

        this.auditLogs.record({
          actorUserId: null,
          module: 'LOAN',
          action: 'EASEBUZZ_MANDATE_AUTHORIZED',
          entityType: 'PlLoanMandate',
          entityId: activeMandate.id.toString(),
          outcome: 'SUCCESS',
          newValue: { lan: loan.lan, transactionId: activeMandate.merchantTransactionId, status: 'AUTHORIZED' },
          requestId: randomBytes(16).toString('hex'),
        }).catch(() => {});
      } else if (([PlMandateStatus.FAILED, PlMandateStatus.REJECTED, PlMandateStatus.CANCELLED, PlMandateStatus.USER_CANCELLED, PlMandateStatus.EXPIRED] as PlMandateStatus[]).includes(normalizedStatus)) {
        await this.prisma.plLoanMandate.update({
          where: { id: activeMandate.id },
          data: {
            status: normalizedStatus,
            providerStatus: String(rawStatus),
            failureReason: failureReason ? String(failureReason).slice(0, 500) : 'Mandate authorization failed',
            failedAt: new Date(),
            lastStatusCheckedAt: new Date(),
            providerResponseJson: JSON.stringify(providerRes.sanitizedResponse || {}),
          },
        });
      } else {
        await this.prisma.plLoanMandate.update({
          where: { id: activeMandate.id },
          data: {
            providerStatus: String(rawStatus),
            lastStatusCheckedAt: new Date(),
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Refresh mandate status check failed for LAN ${lan}: ${err?.message}`);
    }

    return this.getMandateStatus(lan, customerId);
  }

  async handleEasebuzzMandateWebhook(payload: any, metadata?: { ipAddress?: string; userAgent?: string }) {
    const txId =
      payload?.transaction_id ||
      payload?.merchant_transaction_id ||
      payload?.udf1_tx_id ||
      payload?.data?.transaction_id ||
      payload?.data?.merchant_transaction_id ||
      payload?.data?.udf1_tx_id ||
      payload?.data?.mandate?.transaction_id ||
      payload?.txnid ||
      payload?.merchant_txn ||
      payload?.data?.txnid ||
      payload?.data?.merchant_txn;

    const txIdStr = String(txId || '').trim();
    const isPlmTransaction = txIdStr.toUpperCase().startsWith('PLM');

    if (!isPlmTransaction) {
      this.logger.log(
        `Received non-PL mandate webhook [TxID: "${txIdStr || 'NONE'}"]. Forwarding to easycollect mandate webhook endpoint: /api/webhooks/easebuzz/easycollect/mandate`
      );
      return this.forwardToEasycollectMandateWebhook(payload, metadata);
    }

    const sanitized = this.easebuzzAutocollectService.sanitizeEasebuzzMandatePayload(payload);
    const event = String(payload?.event || payload?.data?.event || '').trim().toUpperCase();
    const webhookSecret = this.configService.get<string>('EASEBUZZ_WEBHOOK_SECRET');

    if (webhookSecret) {
      if (!this.easebuzzAutocollectService.verifyEasebuzzMandateWebhookHash(payload)) {
        this.logger.warn(`Easebuzz mandate webhook failed authorization hash verification [event=${event}]`);
        throw new UnauthorizedException('Invalid webhook signature.');
      }
    } else {
      this.logger.log('No EASEBUZZ_WEBHOOK_SECRET configured; skipping Easybuzz webhook signature verification.');
    }

    const providerMandateId =
      payload?.mandate_id ||
      payload?.provider_mandate_id ||
      payload?.data?.mandate_id ||
      payload?.data?.provider_mandate_id ||
      payload?.data?.id ||
      payload?.data?.mandate?.mandate_id ||
      payload?.data?.mandate?.id;
    const rawStatus =
      payload?.status ||
      payload?.mandate_status ||
      payload?.data?.status ||
      payload?.data?.mandate?.status ||
      payload?.data?.mandate_status ||
      payload?.data?.transaction_status ||
      '';

    const maskedTxId = txId ? `...${String(txId).slice(-8)}` : 'UNKNOWN';
    this.logger.log(`Received Easebuzz mandate webhook [TxID: ${maskedTxId}, ProviderMandateId: ${providerMandateId || 'NONE'}, Status: ${rawStatus}]`);

    if (!txId) {
      return { success: false, message: 'Missing transaction_id in webhook payload' };
    }

    // Exact-once processing via interactive transaction and row-level locking
    const result = await this.prisma.$transaction(async (tx) => {
      if (typeof tx.plWebhookInbox?.create === 'function') {
        try {
          await tx.plWebhookInbox.create({
            data: {
              id: randomBytes(16).toString('hex'),
              providerTransactionId: String(
                payload?.data?.id ||
                payload?.data?.transaction_id ||
                payload?.data?.mandate?.mandate_id ||
                payload?.data?.mandate?.transaction_id ||
                payload?.id ||
                payload?.transaction_id ||
                'UNKNOWN'
              ),
              provider: 'easebuzz',
              eventHash: String(payload?.data?.authorization || payload?.authorization || payload?.hash || 'NO_HASH'),
              payload: payload,
            },
          });
        } catch (_e: any) {
          if (_e.code === 'P2002') {
            this.logger.warn(`Idempotent webhook replay detected for Easebuzz event ${payload?.data?.id || payload?.data?.transaction_id}`);
            return { success: true, message: 'Webhook already processed (idempotent replay).' };
          }
          throw _e;
        }
      }

      const mandate = await tx.plLoanMandate.findFirst({
        where: {
          OR: [
            { merchantTransactionId: String(txId) },
            { lan: String(txId) },
            ...(providerMandateId ? [{ providerMandateId: String(providerMandateId) }] : []),
          ],
        },
        include: { loan: true },
      });

      if (!mandate) {
        this.logger.warn(`No local mandate found for webhook TxID ${maskedTxId}`);
        return { success: true, acknowledged: true, processed: false, reason: 'MANDATE_NOT_FOUND' };
      }

      // Lock row to prevent concurrent webhook replays
      await tx.$queryRaw`SELECT id FROM pl_loan_mandates WHERE id = ${mandate.id} FOR UPDATE`;

      const normalizedStatus = this.normalizeEasebuzzMandateStatus(rawStatus);

      // Prevent downgrading an already AUTHORIZED mandate
      if (mandate.status === PlMandateStatus.AUTHORIZED || mandate.status === PlMandateStatus.COMPLETED) {
        this.logger.log(`Mandate ${maskedTxId} is already AUTHORIZED. Ignoring webhook status change.`);
        return { success: true, acknowledged: true, processed: true, note: 'ALREADY_AUTHORIZED' };
      }

      const umrn = payload?.umrn || payload?.bank_reference_number || null;
      const failureReason = payload?.failure_reason || payload?.error_desc || null;

      if (normalizedStatus === PlMandateStatus.AUTHORIZED || normalizedStatus === PlMandateStatus.COMPLETED) {
        await tx.plLoanMandate.update({
          where: { id: mandate.id },
          data: {
            status: PlMandateStatus.AUTHORIZED,
            providerStatus: String(rawStatus),
            providerMandateId: providerMandateId ? String(providerMandateId) : mandate.providerMandateId,
            umrn: umrn ? String(umrn) : mandate.umrn,
            authorizedAt: mandate.authorizedAt || new Date(),
            lastStatusCheckedAt: new Date(),
            webhookResponseJson: JSON.stringify(sanitized || {}),
          },
        });
        
        await tx.plLoan.update({
          where: { id: mandate.loanId },
          data: {
            mandateCompleted: true,
            mandateCompletedAt: new Date(),
            mandateStatus: 'AUTHORIZED',
            mandateProviderRef: providerMandateId ? String(providerMandateId) : mandate.merchantTransactionId,
            currentStep: 'ESIGN',
          },
        });

        this.auditLogs.record({
          actorUserId: null,
          module: 'LOAN',
          action: 'EASEBUZZ_MANDATE_AUTHORIZED',
          entityType: 'PlLoanMandate',
          entityId: mandate.id.toString(),
          outcome: 'SUCCESS',
          newValue: { lan: mandate.lan, transactionId: mandate.merchantTransactionId, status: 'AUTHORIZED' },
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
          requestId: randomBytes(16).toString('hex'),
        }).catch(() => {});

        return { success: true, acknowledged: true, processed: true, mandateJustAuthorized: true, applicationId: mandate.loan.applicationId };
      } else {
        await tx.plLoanMandate.update({
          where: { id: mandate.id },
          data: {
            status: normalizedStatus,
            providerStatus: String(rawStatus),
            failureReason: failureReason ? String(failureReason).slice(0, 500) : null,
            failedAt: ([PlMandateStatus.FAILED, PlMandateStatus.REJECTED, PlMandateStatus.CANCELLED] as PlMandateStatus[]).includes(normalizedStatus) ? new Date() : undefined,
            lastStatusCheckedAt: new Date(),
            webhookResponseJson: JSON.stringify(sanitized || {}),
          },
        });
      }

      return { success: true, acknowledged: true, processed: true, mandateJustAuthorized: false, applicationId: mandate.loan.applicationId };
    });

    // Staged profile push (V4) carrying the webhook-verified UMRN to the lender —
    // reuses the same profile/UPDATE integration as every other stage.
    if (result.mandateJustAuthorized && result.applicationId) {
      this.lenderIntegrationOutbox.enqueueUpdateWhenReady(result.applicationId, 4).catch((err) => {
        this.logger.warn(`Failed to enqueue mandate profile update for application ${result.applicationId}: ${err?.message || err}`);
      });
    }

    return result;
  }

  async forwardToEasycollectMandateWebhook(payload: any, metadata?: { ipAddress?: string; userAgent?: string }) {
    const easycollectMandateUrl =
      process.env.EASYCOLLECT_MANDATE_WEBHOOK_URL ||
      `http://127.0.0.1:${process.env.PORT || 3001}/api/webhooks/easebuzz/easycollect/mandate`;

    try {
      this.logger.log(`Forwarding non-PLM mandate webhook to ${easycollectMandateUrl}`);
      const response = await axios.post(easycollectMandateUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-from': 'pl-mandate-webhook',
          'x-forwarded-for': metadata?.ipAddress || '',
          'user-agent': metadata?.userAgent || '',
        },
        timeout: 10000,
      });

      return {
        success: true,
        forwarded: true,
        targetUrl: easycollectMandateUrl,
        responseData: response.data,
      };
    } catch (err: any) {
      this.logger.warn(
        `HTTP forwarding to ${easycollectMandateUrl} failed: ${err?.message || err}. Falling back to internal EasyCollect mandate handler.`
      );
      return this.handleEasebuzzEasycollectMandateWebhook(payload, metadata);
    }
  }

  async handleEasebuzzEasycollectMandateWebhook(payload: any, metadata?: { ipAddress?: string; userAgent?: string }) {
    const txId =
      payload?.transaction_id ||
      payload?.merchant_transaction_id ||
      payload?.udf1_tx_id ||
      payload?.data?.transaction_id ||
      payload?.data?.merchant_transaction_id ||
      payload?.data?.udf1_tx_id ||
      payload?.data?.mandate?.transaction_id ||
      payload?.txnid ||
      payload?.merchant_txn ||
      'UNKNOWN';

    this.logger.log(
      `[EasyCollect Mandate Webhook] Processed EasyCollect mandate event [TxID: ${txId}, IP: ${metadata?.ipAddress || 'UNKNOWN'}]`
    );

    try {
      if (typeof (this.prisma as any).plWebhookInbox?.create === 'function') {
        await this.prisma.plWebhookInbox.create({
          data: {
            id: randomBytes(16).toString('hex'),
            providerTransactionId: String(txId),
            provider: 'easebuzz-easycollect-mandate',
            eventHash: String(payload?.data?.authorization || payload?.authorization || payload?.hash || 'NO_HASH'),
            payload: payload,
          },
        });
      }
    } catch (_e: any) {
      // Ignore inbox duplicate error if logged
    }

    return {
      success: true,
      acknowledged: true,
      processed: true,
      route: '/api/webhooks/easebuzz/easycollect/mandate',
      txId: String(txId),
      message: 'EasyCollect mandate webhook acknowledged successfully.',
    };
  }

  async initiateEsign(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

    if (!loan.mandateCompleted) {
      throw new BadRequestException('Please complete e-Mandate setup before e-Signing loan agreement.');
    }

    const updatedLoan = await this.prisma.plLoan.update({
      where: { id: loan.id },
      data: {
        esignCompleted: true,
        esignCompletedAt: new Date(),
        esignStatus: 'SUCCESS',
        status: PlLoanStatus.READY_FOR_DISBURSAL,
        currentStep: 'READY_FOR_DISBURSAL',
      },
    });

    this.auditLogs
      .record({
        actorUserId: null,
        module: 'LOAN',
        action: 'ESIGN_COMPLETED',
        entityType: 'PlLoan',
        entityId: loan.id.toString(),
        outcome: 'SUCCESS',
        requestId: randomBytes(16).toString('hex'),
      })
      .catch(() => {});

    return {
      success: true,
      message: 'e-Sign completed successfully',
      nextStep: 'READY_FOR_DISBURSAL',
      loan: {
        lan: updatedLoan.lan,
        esignCompleted: updatedLoan.esignCompleted,
        currentStep: 'READY_FOR_DISBURSAL',
      },
    };
  }

  async requestDisbursal(lan: string, customerId?: bigint) {
    const where: Prisma.PlLoanWhereInput = { lan };
    if (customerId !== undefined) {
      where.customerId = customerId;
    }

    const loan = await this.prisma.plLoan.findFirst({ where });
    if (!loan) {
      throw new NotFoundException(`Loan with LAN ${lan} not found.`);
    }

    if (loan.disbursalStatus === 'DISBURSED' || loan.status === PlLoanStatus.DISBURSED) {
      return {
        success: true,
        data: {
          lan: loan.lan,
          status: 'DISBURSED',
          message: 'Loan is already disbursed.',
        },
      };
    }

    if (
      loan.disbursalStatus === 'DISBURSAL_REQUESTED' ||
      loan.disbursalStatus === 'DISBURSAL_PROCESSING' ||
      loan.status === PlLoanStatus.DISBURSAL_PROCESSING
    ) {
      return {
        success: true,
        data: {
          lan: loan.lan,
          status: loan.disbursalStatus || 'DISBURSAL_REQUESTED',
          message: 'Disbursal request is already in progress.',
        },
      };
    }

    const missingSteps: string[] = [];
    if (!loan.acceptedTenureDays) missingSteps.push('Offer Acceptance');
    if (loan.digilockerStatus !== 'VERIFIED') missingSteps.push('DigiLocker KYC');
    if (!loan.addressConfirmed) missingSteps.push('Address Confirmation');
    if (!loan.bankVerified) missingSteps.push('Bank Account Verification');
    if (!loan.kfsAccepted) missingSteps.push('KFS Acceptance');
    if (!loan.mandateCompleted) missingSteps.push('e-Mandate Setup');
    if (!loan.esignCompleted) missingSteps.push('e-Sign Agreement');

    if (missingSteps.length > 0) {
      throw new BadRequestException(
        `Cannot request disbursal. Pending steps: ${missingSteps.join(', ')}. All steps must be completed in DB before requesting disbursal.`
      );
    }

    const updatedLoan = await this.prisma.plLoan.update({
      where: { id: loan.id },
      data: {
        disbursalStatus: 'DISBURSAL_REQUESTED',
        status: PlLoanStatus.DISBURSAL_PROCESSING,
        disbursalRequestedAt: loan.disbursalRequestedAt || new Date(),
        currentStep: 'READY_FOR_DISBURSAL',
      },
    });

    this.auditLogs
      .record({
        actorUserId: null,
        module: 'LOAN',
        action: 'DISBURSAL_REQUESTED',
        entityType: 'PlLoan',
        entityId: loan.id.toString(),
        outcome: 'SUCCESS',
        requestId: randomBytes(16).toString('hex'),
        newValue: { lan: loan.lan, customerId: loan.customerId.toString() },
      })
      .catch(() => {});

    // Trigger the lender's disburse API via the existing outbox/worker pipeline (same
    // idempotency/retry/auth machinery as CREATE/UPDATE/DECISION) — never a direct HTTP
    // call from here. The actual disbursed confirmation (UTR/status/date) arrives later,
    // asynchronously, via the existing disbursal webhook (processDisbursalWebhook).
    this.lenderIntegrationOutbox.enqueueDisbursalWhenReady(loan.applicationId).catch((err) => {
      this.logger.warn(`Failed to enqueue disbursal trigger for loan ${loan.lan}: ${err?.message || err}`);
    });

    return {
      success: true,
      data: {
        lan: updatedLoan.lan,
        status: 'DISBURSAL_REQUESTED',
        message: 'Disbursal request submitted successfully.',
      },
    };
  }

  async processDisbursalWebhook(
    lenderCode: string,
    rawPayload: Record<string, any>,
    clientIp?: string,
    userAgent?: string,
  ) {
    const lan = String(rawPayload.lan || rawPayload.LAN || rawPayload.loanId || '').trim();
    const disbursalUtr = String(rawPayload.DisbursalUTR || rawPayload.disbursalUtr || rawPayload.utr || '').trim();
    const rawDisbursalDate = rawPayload.DisbursalDate || rawPayload.disbursalDate || rawPayload.disbursement_date;
    const rawAmount = rawPayload.DisbursedAmount ?? rawPayload.disbursedAmount ?? rawPayload.amount;
    const rawRepaymentDate = rawPayload.RepaymentDate || rawPayload.firstRepaymentDate || rawPayload.repaymentDate;
    const rawStatus = String(rawPayload.status || rawPayload.Status || '').trim().toUpperCase();
    const eventId = rawPayload.eventId ? String(rawPayload.eventId).trim() : undefined;

    if (!lan) throw new BadRequestException('LAN is required in disbursal webhook payload');
    if (!disbursalUtr) throw new BadRequestException('DisbursalUTR is required in disbursal webhook payload');
    if (!rawDisbursalDate || isNaN(Date.parse(String(rawDisbursalDate)))) throw new BadRequestException('Valid DisbursalDate is required');
    if (!rawRepaymentDate || isNaN(Date.parse(String(rawRepaymentDate)))) throw new BadRequestException('Valid RepaymentDate is required');

    const amountNum = Number(rawAmount);
    if (!rawAmount || isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('DisbursedAmount must be a positive number');
    }

    const disbursalDate = new Date(rawDisbursalDate);
    const firstRepaymentDate = new Date(rawRepaymentDate);
    if (firstRepaymentDate <= disbursalDate) {
      throw new BadRequestException('RepaymentDate must be later than DisbursalDate');
    }

    const DISBURSAL_STATUS_MAP: Record<string, 'DISBURSED' | 'DISBURSAL_PENDING' | 'DISBURSAL_PROCESSING' | 'DISBURSAL_FAILED'> = {
      SUCCESS: 'DISBURSED',
      DISBURSED: 'DISBURSED',
      COMPLETED: 'DISBURSED',
      PENDING: 'DISBURSAL_PENDING',
      PROCESSING: 'DISBURSAL_PROCESSING',
      FAILED: 'DISBURSAL_FAILED',
      REJECTED: 'DISBURSAL_FAILED',
    };

    const normalizedStatus = DISBURSAL_STATUS_MAP[rawStatus];
    if (!normalizedStatus) {
      throw new BadRequestException(`Unsupported disbursal status: ${rawStatus}`);
    }

    const sanitizedPayload = {
      lan,
      disbursalUtr,
      disbursalDate: disbursalDate.toISOString().slice(0, 10),
      disbursedAmount: amountNum,
      firstRepaymentDate: firstRepaymentDate.toISOString().slice(0, 10),
      status: normalizedStatus,
      rawStatus,
      eventId,
    };

    const payloadHash = createHash('sha256').update(JSON.stringify(sanitizedPayload)).digest('hex');

    return await this.prisma.$transaction(async (tx) => {
      // 1. Check Webhook Event Duplicate Inbox Record
      const existingEvent = await tx.disbursalWebhookEvent.findUnique({
        where: {
          provider_payloadHash: {
            provider: lenderCode,
            payloadHash,
          },
        },
      });

      // 2. Lock & Validate Loan
      const loan = await tx.plLoan.findFirst({
        where: { lan },
        include: { customer: true },
      });

      if (!loan) {
        throw new NotFoundException(`Loan with LAN ${lan} not found.`);
      }

      // Lock row to prevent concurrent webhook replays racing on the already-disbursed
      // check and the repayment-schedule generation below (same pattern as the mandate
      // webhook handler) — payloadHash dedup alone doesn't cover two DIFFERENT-looking
      // deliveries for the same disbursal arriving concurrently.
      await tx.$queryRaw`SELECT id FROM pl_loans WHERE id = ${loan.id} FOR UPDATE`;

      // Check UTR duplicate across other loans
      const utrConflictLoan = await tx.plLoan.findFirst({
        where: {
          disbursalUtr,
          id: { not: loan.id },
        },
      });
      if (utrConflictLoan) {
        throw new ConflictException(`Disbursal UTR ${disbursalUtr} is already registered for another LAN (${utrConflictLoan.lan})`);
      }

      // If loan is already DISBURSED
      if (loan.disbursalStatus === 'DISBURSED' || loan.status === PlLoanStatus.DISBURSED) {
        if (
          loan.disbursalUtr === disbursalUtr &&
          loan.disbursalAmount &&
          Number(loan.disbursalAmount) === amountNum
        ) {
          this.logger.log(`Idempotent duplicate disbursal webhook received for LAN ${lan} [UTR: ${disbursalUtr}]`);
          return {
            success: true,
            status: 'DISBURSED',
            message: 'Disbursal webhook event already processed successfully.',
            lan: loan.lan,
            disbursalUtr,
          };
        } else {
          throw new ConflictException(`Conflicting disbursal details received for LAN ${lan}. Registered UTR: ${loan.disbursalUtr}, Amount: ${loan.disbursalAmount}`);
        }
      }

      // Validate Post Approval Requirements — mirrors the exact precondition set
      // requestDisbursal() checks before the trigger is ever sent, so a webhook can
      // never mark a loan disbursed that shouldn't have been eligible in the first place.
      if (
        !loan.acceptedTenureDays ||
        loan.digilockerStatus !== 'VERIFIED' ||
        !loan.addressConfirmed ||
        !loan.bankVerified ||
        !loan.kfsAccepted ||
        !loan.mandateCompleted ||
        !loan.esignCompleted
      ) {
        throw new BadRequestException(`Post approval requirements for LAN ${lan} are incomplete.`);
      }

      const approvedAmount = Number(loan.approvedAmount);
      if (amountNum > approvedAmount) {
        throw new BadRequestException(`Disbursed amount (${amountNum}) cannot exceed approved loan amount (${approvedAmount})`);
      }

      // Upsert DisbursalWebhookEvent
      const webhookEventRecord = existingEvent
        ? await tx.disbursalWebhookEvent.update({
            where: { id: existingEvent.id },
            data: {
              processingStatus: 'PROCESSED',
              processedAt: new Date(),
              sanitizedPayload,
            },
          })
        : await tx.disbursalWebhookEvent.create({
            data: {
              provider: lenderCode,
              eventId: eventId || null,
              lan,
              payloadHash,
              sanitizedPayload,
              processingStatus: 'PROCESSED',
              processedAt: new Date(),
            },
          });

      // 3. Update Loan Record
      const updatedLoan = await tx.plLoan.update({
        where: { id: loan.id },
        data: {
          disbursalStatus: normalizedStatus,
          status: normalizedStatus === 'DISBURSED' ? PlLoanStatus.DISBURSED : PlLoanStatus.FAILED,
          currentStep: normalizedStatus === 'DISBURSED' ? 'DISBURSED' : 'DISBURSAL_FAILED',
          disbursalAmount: new Prisma.Decimal(amountNum),
          disbursalUtr,
          disbursalDate,
          firstRepaymentDate,
          disbursalCompletedAt: new Date(),
        },
      });

      // 4. Generate RPS (Repayment Schedule) if normalizedStatus is DISBURSED
      let generatedRpsCount = 0;
      if (normalizedStatus === 'DISBURSED') {
        const existingRpsCount = await tx.plRepaymentSchedule.count({
          where: { loanId: loan.id },
        });

        if (existingRpsCount === 0) {
          // Repayment principal must be the sanctioned/approved amount the customer's
          // KFS and e-signed agreement are based on — not the webhook's disbursed
          // amount, which is net of the processing fee Fintree deducts before transfer.
          // Charging repayment on the net-disbursed figure would silently repay a
          // different total than what the customer agreed to.
          const rpsRows = this.calculateRpsRows(
            loan.id,
            loan.lan,
            approvedAmount,
            loan.acceptedInterestRate ? Number(loan.acceptedInterestRate) : 18,
            loan.acceptedTenureDays || 30,
            disbursalDate,
            firstRepaymentDate,
          );

          for (const rps of rpsRows) {
            await tx.plRepaymentSchedule.create({ data: rps });
          }
          generatedRpsCount = rpsRows.length;
        }
      }

      // Record Audit Event
      await tx.plLoanAuditEvent.create({
        data: {
          loanId: loan.id,
          lan: loan.lan,
          customerId: loan.customerId,
          applicationId: loan.applicationId,
          eventType: normalizedStatus === 'DISBURSED' ? 'DISBURSAL_CONFIRMED' : 'DISBURSAL_WEBHOOK_FAILED',
          metadata: {
            provider: lenderCode,
            eventId,
            disbursalUtr,
            disbursedAmount: amountNum,
            status: normalizedStatus,
            rpsCount: generatedRpsCount,
            webhookEventId: webhookEventRecord.id.toString(),
          },
          ipAddress: clientIp || null,
          userAgent: userAgent || null,
        },
      });

      return {
        success: true,
        status: normalizedStatus,
        message: normalizedStatus === 'DISBURSED' ? 'Disbursal processed and repayment schedule generated successfully' : 'Disbursal failure recorded',
        lan: updatedLoan.lan,
        disbursalUtr,
        disbursedAmount: amountNum,
        firstRepaymentDate: firstRepaymentDate.toISOString().slice(0, 10),
      };
    });
  }

  private calculateRpsRows(
    loanId: bigint,
    lan: string,
    principal: number,
    annualRate: number,
    tenureDays: number,
    disbursalDate: Date,
    firstRepaymentDate: Date,
  ): Prisma.PlRepaymentScheduleCreateInput[] {
    const rows: Prisma.PlRepaymentScheduleCreateInput[] = [];

    // Personal Loan (PL) Bullet Repayment calculation
    // Excel formula: ROUND(loan amount * interest rate * 1/365 * tenure, 0)
    const tenureFraction = tenureDays / 365;
    const interestVal = Math.round(principal * (annualRate / 100) * tenureFraction);
    const emiVal = principal + interestVal;

    let dueDate = firstRepaymentDate;
    if (!dueDate || isNaN(new Date(dueDate).getTime())) {
      dueDate = new Date(disbursalDate);
      dueDate.setDate(dueDate.getDate() + tenureDays);
    }

    rows.push({
      loan: { connect: { id: loanId } },
      lan,
      installmentNumber: 1,
      dueDate,
      openingPrincipal: new Prisma.Decimal(principal),
      emi: new Prisma.Decimal(emiVal),
      interest: new Prisma.Decimal(interestVal),
      principal: new Prisma.Decimal(principal),
      closingPrincipal: new Prisma.Decimal(0.00),
      outstandingPrincipal: new Prisma.Decimal(principal),
      paymentStatus: 'PENDING',
      dpd: 0,
      paidAmount: new Prisma.Decimal(0.00),
      remainingAmount: new Prisma.Decimal(emiVal),
    });

    return rows;
  }

  async getLoanDetails(lan: string, customerId: bigint) {
    const loan = await this.prisma.plLoan.findFirst({
      where: { lan, customerId },
      include: {
        repaymentSchedules: {
          orderBy: { installmentNumber: 'asc' },
        },
        repayments: {
          include: {
            allocations: {
              orderBy: { id: 'asc' },
            },
          },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    if (!loan) {
      throw new NotFoundException(`Loan with LAN ${lan} not found for this customer.`);
    }

    const rpsList = loan.repaymentSchedules || [];
    const repaymentsList = loan.repayments || [];

    let principalOutstanding = 0;
    let interestOutstanding = 0;
    let totalPaid = 0;
    let overdueAmount = 0;
    let nextDueDate: Date | null = null;
    let nextEmiAmount = 0;

    const now = new Date();

    for (const rps of rpsList) {
      const remaining = Number(rps.remainingAmount);
      const paid = Number(rps.paidAmount);
      totalPaid += paid;

      if (rps.paymentStatus !== 'PAID') {
        principalOutstanding += Number(rps.principal);
        interestOutstanding += Number(rps.interest);

        if (rps.dueDate < now) {
          overdueAmount += remaining;
        }

        if (!nextDueDate) {
          nextDueDate = rps.dueDate;
          nextEmiAmount = Number(rps.emi);
        }
      }
    }

    const totalOutstanding = principalOutstanding + interestOutstanding;

    const formattedRps = rpsList.map((rps) => ({
      installmentNumber: rps.installmentNumber,
      dueDate: rps.dueDate ? rps.dueDate.toISOString().slice(0, 10) : null,
      openingPrincipal: Number(rps.openingPrincipal),
      emi: Number(rps.emi),
      interest: Number(rps.interest),
      principal: Number(rps.principal),
      closingPrincipal: Number(rps.closingPrincipal),
      outstandingPrincipal: Number(rps.outstandingPrincipal),
      paymentStatus: rps.paymentStatus,
      dpd: rps.dpd,
      paidAmount: Number(rps.paidAmount),
      paymentDate: rps.paymentDate,
      remainingAmount: Number(rps.remainingAmount),
    }));

    const formattedRepayments = repaymentsList.map((rep) => ({
      paymentId: rep.paymentId,
      paymentDate: rep.paymentDate,
      amountReceived: Number(rep.amountReceived),
      paymentMode: rep.paymentMode,
      referenceNumber: rep.referenceNumber,
      status: rep.status,
      unallocatedAmount: Number(rep.unallocatedAmount),
    }));

    const formattedAllocations = repaymentsList.flatMap((rep) =>
      (rep.allocations || []).map((alloc) => ({
        paymentId: rep.paymentId,
        installmentNumber: alloc.installmentNumber,
        component: alloc.component,
        allocatedAmount: Number(alloc.allocatedAmount),
        allocationDate: alloc.allocationDate,
      })),
    );

    return {
      loan: {
        lan: loan.lan,
        status: loan.status,
        approvedAmount: Number(loan.approvedAmount),
        disbursedAmount: loan.disbursalAmount ? Number(loan.disbursalAmount) : Number(loan.approvedAmount),
        disbursalUtr: loan.disbursalUtr || null,
        disbursalDate: loan.disbursalDate ? loan.disbursalDate.toISOString().slice(0, 10) : null,
        firstRepaymentDate: loan.firstRepaymentDate ? loan.firstRepaymentDate.toISOString().slice(0, 10) : null,
        repaymentFrequency: 'MONTHLY',
        interestRate: loan.acceptedInterestRate ? Number(loan.acceptedInterestRate) : 18,
        tenure: loan.acceptedTenureDays || 30,
      },
      disbursal: {
        status: loan.disbursalStatus || loan.status,
        requestedAt: loan.disbursalRequestedAt,
        processedAt: loan.disbursalCompletedAt,
        providerReference: loan.disbursalProviderRef || loan.disbursalUtr || null,
      },
      summary: {
        principalOutstanding,
        interestOutstanding,
        totalOutstanding,
        totalPaid,
        overdueAmount,
        nextDueDate: nextDueDate ? nextDueDate.toISOString().slice(0, 10) : null,
        nextEmiAmount,
      },
      rps: formattedRps,
      repayments: formattedRepayments,
      allocations: formattedAllocations,
    };
  }

  async processRepayment(
    lanInput: string,
    payload: {
      installmentNumber: number;
      amount: number;
      paymentId?: string;
      paymentMode?: string;
      referenceNumber?: string;
    },
  ) {
    const lan = String(lanInput || '').trim();
    if (!lan) throw new BadRequestException('LAN is required.');
    const instNum = Number(payload.installmentNumber);
    if (!instNum || instNum < 1) throw new BadRequestException('Valid installmentNumber is required.');

    const amountNum = Number(payload.amount);
    if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Payment amount must be a positive number.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Fetch Loan
      const loan = await tx.plLoan.findFirst({
        where: { lan },
      });
      if (!loan) throw new NotFoundException(`Loan with LAN ${lan} not found.`);

      // 2. Fetch target RPS installment
      const rps = await tx.plRepaymentSchedule.findUnique({
        where: {
          lan_installmentNumber: {
            lan,
            installmentNumber: instNum,
          },
        },
      });
      if (!rps) throw new NotFoundException(`Installment #${instNum} not found for LAN ${lan}.`);

      const remainingAmount = Number(rps.remainingAmount);
      if (remainingAmount <= 0 || rps.paymentStatus === 'PAID') {
        throw new BadRequestException(`Installment #${instNum} is already fully paid.`);
      }

      // Idempotency guard: a retried/duplicate webhook delivery for the same payment must
      // not double-count. paymentId carries a DB unique constraint, but callers that don't
      // supply one (or a referenceNumber) previously fell back to a fresh random ID on every
      // call, silently defeating that constraint on retry. Check by referenceNumber first
      // (the caller's own stable transaction reference) before ever generating a fallback ID.
      if (payload.referenceNumber) {
        const existingByReference = await tx.plRepayment.findFirst({
          where: { lan, referenceNumber: payload.referenceNumber },
        });
        if (existingByReference) {
          return {
            success: true,
            duplicate: true,
            message: 'Repayment already processed for this reference.',
            data: { paymentId: existingByReference.paymentId, referenceNumber: existingByReference.referenceNumber },
          };
        }
      }

      if (payload.paymentId) {
        const existingByPaymentId = await tx.plRepayment.findUnique({ where: { paymentId: payload.paymentId } });
        if (existingByPaymentId) {
          return {
            success: true,
            duplicate: true,
            message: 'Repayment already processed for this payment ID.',
            data: { paymentId: existingByPaymentId.paymentId, referenceNumber: existingByPaymentId.referenceNumber },
          };
        }
      }

      // Generate unique paymentId if not provided
      const paymentId = payload.paymentId || `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // 3. Create PlRepayment Record
      const repayment = await tx.plRepayment.create({
        data: {
          lan,
          loanId: loan.id,
          paymentId,
          amountReceived: new Prisma.Decimal(amountNum),
          paymentDate: new Date(),
          paymentMode: payload.paymentMode || 'EASEBUZZ',
          referenceNumber: payload.referenceNumber || paymentId,
          status: 'SUCCESS',
          unallocatedAmount: new Prisma.Decimal(0),
        },
      });

      // 4. Waterfall Component Allocation (IPC Order: Interest -> Principal -> Charges)
      const interestDue = Number(rps.interest);
      const principalDue = Number(rps.principal);
      const paidSoFar = Number(rps.paidAmount);

      let allocInterest = 0;
      let allocPrincipal = 0;
      let unallocated = amountNum;

      // I - Interest
      const unpaidInterest = Math.max(0, interestDue - paidSoFar);
      if (unpaidInterest > 0) {
        allocInterest = Math.min(unallocated, unpaidInterest);
        unallocated -= allocInterest;
      }

      // P - Principal
      const unpaidPrincipal = Math.max(0, principalDue - Math.max(0, paidSoFar - interestDue));
      if (unallocated > 0 && unpaidPrincipal > 0) {
        allocPrincipal = Math.min(unallocated, unpaidPrincipal);
        unallocated -= allocPrincipal;
      }

      if (allocInterest > 0) {
        await tx.plRepaymentAllocation.create({
          data: {
            lan,
            repaymentId: repayment.id,
            loanId: loan.id,
            installmentNumber: instNum,
            component: 'INTEREST',
            allocatedAmount: new Prisma.Decimal(allocInterest),
            allocationDate: new Date(),
          },
        });
      }

      if (allocPrincipal > 0) {
        await tx.plRepaymentAllocation.create({
          data: {
            lan,
            repaymentId: repayment.id,
            loanId: loan.id,
            installmentNumber: instNum,
            component: 'PRINCIPAL',
            allocatedAmount: new Prisma.Decimal(allocPrincipal),
            allocationDate: new Date(),
          },
        });
      }

      // C - Charges (BOUNCE_CHARGE, PENAL_CHARGE)
      if (unallocated > 0) {
        try {
          const pendingCharges = await (tx as any).plLoanCharge.findMany({
            where: {
              lan,
              status: { in: ['PENDING', 'PARTIAL'] },
            },
            orderBy: { id: 'asc' },
          });

          for (const chg of pendingCharges) {
            if (unallocated <= 0) break;
            const remChg = Number(chg.remainingAmount);
            const allocChg = Math.min(unallocated, remChg);
            unallocated -= allocChg;

            const newPaidChg = Number(chg.paidAmount) + allocChg;
            const newRemChg = remChg - allocChg;
            const newChgStatus = newRemChg === 0 ? 'PAID' : 'PARTIAL';

            await (tx as any).plLoanCharge.update({
              where: { id: chg.id },
              data: {
                paidAmount: new Prisma.Decimal(newPaidChg),
                remainingAmount: new Prisma.Decimal(newRemChg),
                status: newChgStatus,
              },
            });

            await tx.plRepaymentAllocation.create({
              data: {
                lan,
                repaymentId: repayment.id,
                loanId: loan.id,
                installmentNumber: instNum,
                component: chg.chargeType,
                allocatedAmount: new Prisma.Decimal(allocChg),
                allocationDate: new Date(),
              },
            });
          }
        } catch (_err) {
          // Non-critical if table does not exist yet before DDL execution
        }
      }

      // 5. Update PlRepaymentSchedule row
      const newPaidAmount = paidSoFar + amountNum;
      const newRemainingAmount = Math.max(0, Number(rps.emi) - newPaidAmount);
      const newPaymentStatus = newRemainingAmount === 0 ? 'PAID' : 'PARTIAL';

      await tx.plRepaymentSchedule.update({
        where: { id: rps.id },
        data: {
          paidAmount: new Prisma.Decimal(newPaidAmount),
          remainingAmount: new Prisma.Decimal(newRemainingAmount),
          paymentStatus: newPaymentStatus,
          paymentDate: new Date(),
        },
      });

      // 6. Record Audit Log
      this.auditLogs
        .record({
          actorUserId: null,
          module: 'LOAN',
          action: 'REPAYMENT_SUCCESS',
          entityType: 'PlLoan',
          entityId: loan.id.toString(),
          outcome: 'SUCCESS',
          requestId: randomBytes(16).toString('hex'),
          newValue: { lan, installmentNumber: instNum, amount: amountNum, paymentId },
        })
        .catch(() => {});

      return {
        success: true,
        message: `Repayment of ₹${amountNum} recorded successfully for Installment #${instNum}`,
        paymentId,
        installmentNumber: instNum,
        newRemainingAmount,
        paymentStatus: newPaymentStatus,
        applicationId: loan.applicationId,
        repaymentId: repayment.id,
      };
    });

    // Only for a genuinely new repayment — the duplicate-reference/duplicate-paymentId
    // early-return branches above don't carry applicationId/repaymentId, so this is a
    // no-op replay for those, which is correct: nothing new happened to notify about.
    if (result.applicationId && result.repaymentId) {
      // Trigger the lender's repayment-notification API via the existing outbox/worker
      // pipeline (same idempotency/retry/auth machinery as CREATE/UPDATE/DISBURSE) —
      // never a direct HTTP call from here, and never allowed to fail the repayment
      // itself (it already succeeded in our own system by the time this fires).
      this.lenderIntegrationOutbox.enqueueRepaymentNotification(result.applicationId, result.repaymentId).catch((err) => {
        this.logger.warn(`Failed to enqueue repayment notification for loan ${lan}: ${err?.message || err}`);
      });
    }

    return result;
  }

  async addLoanCharge(
    lanInput: string,
    payload: { chargeType: string; amount: number; dueDate: Date; remarks?: string },
    actorUserId?: string,
  ) {
    const lan = String(lanInput || '').trim();
    if (!lan) throw new BadRequestException('LAN is required.');

    // Normalized to match this table's own documented convention (chargeType String
    // // BOUNCE_CHARGE, PENAL_CHARGE) regardless of how the caller capitalizes it.
    const chargeType = String(payload.chargeType || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!chargeType) throw new BadRequestException('chargeType is required.');

    const amountNum = Number(payload.amount);
    if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Charge amount must be a positive number.');
    }
    if (!payload.dueDate) throw new BadRequestException('dueDate is required.');

    const loan = await this.prisma.plLoan.findFirst({ where: { lan } });
    if (!loan) throw new NotFoundException(`Loan with LAN ${lan} not found.`);

    const charge = await this.prisma.plLoanCharge.create({
      data: {
        loanId: loan.id,
        lan,
        chargeType,
        amount: new Prisma.Decimal(amountNum),
        paidAmount: new Prisma.Decimal(0),
        remainingAmount: new Prisma.Decimal(amountNum),
        status: 'PENDING',
        dueDate: payload.dueDate,
        description: payload.remarks?.trim() || null,
      },
    });

    this.auditLogs
      .record({
        actorUserId: actorUserId ?? null,
        module: 'LOAN',
        action: 'LOAN_CHARGE_ADDED',
        entityType: 'PlLoanCharge',
        entityId: charge.id.toString(),
        outcome: 'SUCCESS',
        requestId: randomBytes(16).toString('hex'),
        newValue: { lan, chargeType, amount: amountNum, dueDate: payload.dueDate },
      })
      .catch(() => {});

    // Trigger the lender's charge-notification API via the existing outbox/worker
    // pipeline — never a direct HTTP call from here, never allowed to fail the charge
    // creation itself (it already succeeded in our own system by the time this fires).
    this.lenderIntegrationOutbox.enqueueChargeNotification(loan.applicationId, charge.id).catch((err) => {
      this.logger.warn(`Failed to enqueue charge notification for loan ${lan}: ${err?.message || err}`);
    });

    return {
      success: true,
      message: `Charge '${chargeType}' of ₹${amountNum} added to loan ${lan}.`,
      chargeId: charge.id.toString(),
    };
  }

  async waiveLoanCharge(
    lanInput: string,
    chargeId: bigint,
    payload: { waiverAmount: number; remarks?: string },
    actorUserId?: string,
  ) {
    const lan = String(lanInput || '').trim();
    if (!lan) throw new BadRequestException('LAN is required.');

    const waiverAmountNum = Number(payload.waiverAmount);
    if (!waiverAmountNum || isNaN(waiverAmountNum) || waiverAmountNum <= 0) {
      throw new BadRequestException('waiverAmount must be a positive number.');
    }

    const charge = await this.prisma.plLoanCharge.findFirst({ where: { id: chargeId, lan }, include: { loan: true } });
    if (!charge) throw new NotFoundException(`Charge ${chargeId} not found for LAN ${lan}.`);
    if (!['PENDING', 'PARTIAL'].includes(charge.status)) {
      throw new BadRequestException(`Charge is not outstanding (status: ${charge.status}).`);
    }

    const remaining = Number(charge.remainingAmount);
    if (waiverAmountNum > remaining) {
      throw new BadRequestException(`waiverAmount (${waiverAmountNum}) exceeds the outstanding amount (${remaining}).`);
    }

    // Reaches zero -> fully cleared via waiver. Otherwise stays PARTIAL/PENDING,
    // still collectible for the rest — a charge can be waived more than once.
    const newRemaining = Math.round((remaining - waiverAmountNum) * 100) / 100;

    const waiver = await this.prisma.$transaction(async (tx) => {
      await tx.plLoanCharge.update({
        where: { id: charge.id },
        data: {
          remainingAmount: new Prisma.Decimal(newRemaining),
          status: newRemaining === 0 ? 'WAIVED' : charge.status,
        },
      });

      return tx.plLoanChargeWaiver.create({
        data: {
          chargeId: charge.id,
          loanId: charge.loanId,
          lan,
          waiverAmount: new Prisma.Decimal(waiverAmountNum),
          waivedByUserId: actorUserId ?? null,
          remarks: payload.remarks?.trim() || null,
        },
      });
    });

    this.auditLogs
      .record({
        actorUserId: actorUserId ?? null,
        module: 'LOAN',
        action: 'LOAN_CHARGE_WAIVED',
        entityType: 'PlLoanCharge',
        entityId: charge.id.toString(),
        outcome: 'SUCCESS',
        requestId: randomBytes(16).toString('hex'),
        newValue: { lan, waiverAmount: waiverAmountNum, remainingAfter: newRemaining },
      })
      .catch(() => {});

    this.lenderIntegrationOutbox.enqueueChargeWaiverNotification(charge.loan.applicationId, waiver.id).catch((err) => {
      this.logger.warn(`Failed to enqueue charge waiver notification for loan ${lan}: ${err?.message || err}`);
    });

    return {
      success: true,
      message: `Waived ₹${waiverAmountNum} on charge ${chargeId} for loan ${lan}.`,
      waiverId: waiver.id.toString(),
      remainingAmount: newRemaining,
    };
  }

  async initiateRepaymentPayment(
    lanInput: string,
    customerIdInput: bigint | number | string,
    installmentNumberInput: number,
    amountInput?: number,
  ) {
    const lan = String(lanInput || '').trim();
    const instNum = Number(installmentNumberInput);
    if (!lan) throw new BadRequestException('LAN is required.');
    if (!instNum || instNum < 1) throw new BadRequestException('Valid installmentNumber is required.');

    const loan = await this.prisma.plLoan.findFirst({
      where: { lan },
      include: { customer: true },
    });
    if (!loan) throw new NotFoundException(`Loan with LAN ${lan} not found.`);

    const rps = await this.prisma.plRepaymentSchedule.findUnique({
      where: {
        lan_installmentNumber: {
          lan,
          installmentNumber: instNum,
        },
      },
    });
    if (!rps) throw new NotFoundException(`Installment #${instNum} not found for LAN ${lan}.`);

    const remainingAmount = Number(rps.remainingAmount);
    if (remainingAmount <= 0 || rps.paymentStatus === 'PAID') {
      throw new BadRequestException(`Installment #${instNum} is already fully paid.`);
    }

    const payAmount = amountInput && amountInput > 0 ? Math.min(amountInput, remainingAmount) : remainingAmount;

    const customer = loan.customer;
    const customerName =
      customer.fullName ||
      [customer.firstName, customer.middleName, customer.lastName].filter(Boolean).join(' ').trim() ||
      'Customer';
    const txnid = `RPY-${loan.id}-${instNum}-${Date.now()}`;

    const successUrl =
      this.configService.get<string>('EASEBUZZ_SUCCESS_URL') ||
      `${this.configService.get('FRONTEND_URL') || 'http://localhost:5173'}/customer/loan/${lan}/details`;
    const failureUrl =
      this.configService.get<string>('EASEBUZZ_FAILURE_URL') ||
      `${this.configService.get('FRONTEND_URL') || 'http://localhost:5173'}/customer/loan/${lan}/details`;

    const initiatedPayment = await initiateEasebuzzIframePayment({
      txnid,
      amount: payAmount,
      productinfo: `LOAN EMI REPAYMENT INST #${instNum}`,
      firstname: customerName,
      phone: customer.mobileNumber || '',
      email: customer.email || '',
      surl: successUrl,
      furl: failureUrl,
      udf1: customer.id.toString(),
      udf2: customer.customerCode,
      udf3: 'EMI_REPAYMENT',
      udf4: lan,
      udf5: instNum.toString(),
    });

    return {
      success: true,
      accessKey: initiatedPayment.accessKey,
      merchantKey: initiatedPayment.key,
      env: initiatedPayment.environment,
      txnid,
      lan,
      installmentNumber: instNum,
      amount: payAmount,
    };
  }

  async resetLoanRpsAndDisbursal(lan: string, customerId?: bigint) {
    const whereClause: any = { lan };
    if (customerId) whereClause.customerId = customerId;

    const loan = await this.prisma.plLoan.findFirst({ where: whereClause });
    if (!loan) throw new NotFoundException(`Loan with LAN ${lan} not found.`);

    return await this.prisma.$transaction(async (tx) => {
      await tx.plRepaymentAllocation.deleteMany({ where: { loanId: loan.id } });
      await tx.plRepayment.deleteMany({ where: { loanId: loan.id } });
      await tx.plRepaymentSchedule.deleteMany({ where: { loanId: loan.id } });
      try {
        await (tx as any).plLoanCharge.deleteMany({ where: { loanId: loan.id } });
      } catch (_e) {}
      await tx.disbursalWebhookEvent.deleteMany({ where: { lan: loan.lan } });

      await tx.plLoan.update({
        where: { id: loan.id },
        data: {
          disbursalStatus: 'NOT_STARTED',
          status: PlLoanStatus.READY_FOR_DISBURSAL,
          currentStep: 'READY_FOR_DISBURSAL',
          disbursalAmount: null,
          disbursalUtr: null,
          disbursalDate: null,
          firstRepaymentDate: null,
          disbursalCompletedAt: null,
        },
      });

      return {
        success: true,
        message: `Loan ${lan} RPS schedules, repayments, allocations, and disbursal webhooks cleared. Ready for fresh disbursal webhook.`,
      };
    });
  }
}
