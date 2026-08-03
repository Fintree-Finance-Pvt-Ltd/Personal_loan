import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PlApplicationStatus, PlLoanStatus, PlDocumentType, PlDocumentStatus, PlMandateStatus, PlMandateType, PlMandateProvider, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { DigitapDigilockerService } from '../external-api/digitap-digilocker.service';
import { ExternalApiService } from '../external-api/external-api.service';
import { EasebuzzAutocollectService } from '../../integrations/easebuzz-autocollect.service';
import { decryptBankAccountNumber } from '../../common/utils/bank-security.helper';
import { normalizeDigitapDetails, sanitizeDigitapPayload } from './digilocker-normalizer';

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
  ) { }

  private generateLan(): string {
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const sequence = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `PL${dateStr}${sequence}`;
  }

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

    const lan = this.generateLan();

    // Create the offer valid for 30 days
    const offerValidUntil = new Date();
    offerValidUntil.setDate(offerValidUntil.getDate() + 30);

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
    if (loan.disbursalStatus === 'PROCESSING' || loan.status === PlLoanStatus.DISBURSAL_PROCESSING) {
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
    const processingFee = loan.acceptedProcessingFee ? Number(loan.acceptedProcessingFee) : Math.round(approvedAmount * 0.02);
    const netDisbursalAmount = approvedAmount - processingFee;
    const totalRepaymentAmount = loan.acceptedTotalRepayment ? Number(loan.acceptedTotalRepayment) : approvedAmount;
    let dueDate = null;
    if (loan.acceptedTenureDays) {
      const d = new Date();
      d.setDate(d.getDate() + loan.acceptedTenureDays);
      dueDate = d.toISOString();
    }

    const kfs = {
      lan: loan.lan,
      loanAmount: approvedAmount,
      tenureDays: loan.acceptedTenureDays,
      netDisbursalAmount,
      totalRepaymentAmount,
      dueDate,
      kfsAccepted: loan.kfsAccepted,
      kfsAcceptedAt: loan.kfsAcceptedAt,
      documentUrl: loan.kfsDocumentId || null,
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

    // Dummy pricing calculation
    const principal = Number(loan.approvedAmount) || 0;
    const interestRate = 18.0;
    const processingFee = principal * 0.02;
    const months = tenureDays / 30;
    const ratePerMonth = interestRate / 12 / 100;
    const emi = months > 0
      ? (principal * ratePerMonth * Math.pow(1 + ratePerMonth, months)) / (Math.pow(1 + ratePerMonth, months) - 1)
      : 0;
    const totalRepayment = emi * months;

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

    const uniqueId = `${lan}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const response = await this.digitapService.generateDigitapDigilockerUrl({
      uid: uniqueId,
      mobile: loan.customer?.mobileNumber || undefined,
      emailId: loan.customer?.email || undefined,
      firstName: loan.customer?.firstName || undefined,
      lastName: loan.customer?.lastName || undefined,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.plLoan.update({
        where: { id: loan.id },
        data: {
          digilockerStatus: 'INITIATED',
          digilockerSessionId: response.transactionId,
          digilockerReference: uniqueId,
          digilockerConsentAt: new Date(),
          currentStep: 'DIGILOCKER_KYC',
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
    if (loan.digilockerStatus !== 'VERIFIED') {
      throw new BadRequestException('Please complete Aadhaar KYC verification before setting up e-Mandate.');
    }
    if (!loan.addressConfirmed) {
      throw new BadRequestException('Please confirm your residential address before setting up e-Mandate.');
    }
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
    const sanitized = this.easebuzzAutocollectService.sanitizeEasebuzzMandatePayload(payload);
    const event = String(payload?.event || payload?.data?.event || '').trim().toUpperCase();

    if (!this.easebuzzAutocollectService.verifyEasebuzzMandateWebhookHash(payload)) {
      this.logger.warn(`Easebuzz mandate webhook failed authorization hash verification [event=${event}]`);
      throw new UnauthorizedException('Invalid webhook signature.');
    }

    const txId =
      payload?.transaction_id ||
      payload?.merchant_transaction_id ||
      payload?.udf1_tx_id ||
      payload?.data?.transaction_id ||
      payload?.data?.merchant_transaction_id ||
      payload?.data?.udf1_tx_id ||
      payload?.data?.mandate?.transaction_id;
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
    return this.prisma.$transaction(async (tx) => {
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

      return { success: true, acknowledged: true, processed: true };
    });
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

  async requestDisbursal(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

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
        disbursalStatus: 'DISBURSED',
        status: PlLoanStatus.DISBURSED,
        disbursalRequestedAt: loan.disbursalRequestedAt || new Date(),
        disbursalCompletedAt: new Date(),
        currentStep: 'DISBURSED',
      },
    });

    this.auditLogs
      .record({
        actorUserId: null,
        module: 'LOAN',
        action: 'LOAN_DISBURSED',
        entityType: 'PlLoan',
        entityId: loan.id.toString(),
        outcome: 'SUCCESS',
        requestId: randomBytes(16).toString('hex'),
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Loan disbursed successfully',
      nextStep: 'DISBURSED',
      loan: {
        lan: updatedLoan.lan,
        disbursalStatus: updatedLoan.disbursalStatus,
        currentStep: 'DISBURSED',
      },
    };
  }
}
