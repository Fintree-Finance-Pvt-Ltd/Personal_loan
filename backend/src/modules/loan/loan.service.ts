import { Injectable, NotFoundException, ForbiddenException, BadRequestException, BadGatewayException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PlApplicationStatus, PlLoanStatus, PlDocumentType, PlDocumentStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { DigitapDigilockerService } from '../external-api/digitap-digilocker.service';
import { ExternalApiService } from '../external-api/external-api.service';
import { normalizeDigitapDetails, sanitizeDigitapPayload, normalizeDigitapStatus } from './digilocker-normalizer';

@Injectable()
export class LoanService {
  private readonly logger = new Logger(LoanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly digitapService: DigitapDigilockerService,
    private readonly externalApiService: ExternalApiService,
  ) { }

  private generateLan(): string {
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const sequence = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `PL${dateStr}${sequence}`;
  }

  async findLoanByLanAndCustomer(lan: string, customerId: bigint) {
    const where: any = { lan };
    if (customerId && customerId > 0n) {
      where.customerId = customerId;
    }

    let loan = await this.prisma.plLoan.findFirst({
      where,
      include: {
        application: true,
        customer: true,
      },
    });

    if (!loan && customerId && customerId > 0n) {
      loan = await this.prisma.plLoan.findFirst({
        where: { lan },
        include: {
          application: true,
          customer: true,
        },
      });
    }

    if (!loan) {
      throw new NotFoundException('Loan not found or does not belong to this customer');
    }

    return loan;
  }

  async createLoanAfterApproval(applicationId: bigint, customerId: bigint, amount: number, lenderCode: string = 'FTF') {
    // Idempotency check: see if loan already exists for this application
    const existingLoan = await this.prisma.plLoan.findFirst({
      where: { applicationId },
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
    if (loan.status === PlLoanStatus.READY_FOR_DISBURSAL) {
      return 'READY_FOR_DISBURSAL';
    }
    if (loan.esignCompleted) {
      return 'ESIGN'; // or READY_FOR_DISBURSAL depending on auto-transition
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
    if (loan.addressConfirmed) {
      return 'BANK_VERIFICATION';
    }
    if (loan.digilockerStatus === 'VERIFIED') {
      return 'ADDRESS_CONFIRMATION';
    }
    if (loan.acceptedTenureDays) {
      return 'DIGILOCKER_KYC';
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

    return {
      loan: {
        id: loan.id.toString(),
        lan: loan.lan,
        status: loan.status,
        applicationId: loan.applicationId.toString(),
        applicationNumber: loan.application.applicationNumber,
        approvedAmount: loan.approvedAmount ? Number(loan.approvedAmount) : null,
        approvedAt: loan.lenderApprovedAt,
      },
      customer: {
        customerCode: loan.customer.customerCode,
        fullName: loan.customer.fullName,
      },
      lender: {
        code: loan.lenderCode,
        name: 'Fintree Finance Private Limited',
      },
      offer: {
        offerStatus: loan.offerStatus,
        approvedAmount: loan.approvedAmount ? Number(loan.approvedAmount) : null,
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
        acceptedProcessingFee: loan.acceptedProcessingFee ? Number(loan.acceptedProcessingFee) : null,
        acceptedEmiAmount: loan.acceptedEmiAmount ? Number(loan.acceptedEmiAmount) : null,
        acceptedTotalRepayment: loan.acceptedTotalRepayment ? Number(loan.acceptedTotalRepayment) : null,
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
      },
      workflow: {
        lenderApproved: loan.status !== PlLoanStatus.FAILED && loan.status !== PlLoanStatus.CANCELLED,
        offerAccepted: !!loan.acceptedTenureDays,
        digilockerVerified: loan.digilockerStatus === 'VERIFIED',
        addressConfirmed: loan.addressConfirmed,
        bankVerified: loan.bankVerified,
        kfsAccepted: loan.kfsAccepted,
        mandateCompleted: loan.mandateCompleted,
        esignCompleted: loan.esignCompleted,
        readyForDisbursal:
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
        currentStep: 'DIGILOCKER_KYC',
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

    return { success: true, message: 'Offer accepted successfully.', nextStep: 'DIGILOCKER_KYC' };
  }

  async saveAddress(lan: string, customerId: bigint, payload: any) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

    if (loan.digilockerStatus !== 'VERIFIED') {
      throw new BadRequestException('Aadhaar verification not completed');
    }

    let updateData: Prisma.PlLoanUpdateInput = {
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

    const updatedLoan = await this.prisma.plLoan.update({
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
          } catch (e) {
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

  async initiateMandate(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

    const updatedLoan = await this.prisma.plLoan.update({
      where: { id: loan.id },
      data: {
        mandateCompleted: true,
        mandateCompletedAt: new Date(),
        mandateInitiatedAt: loan.mandateInitiatedAt || new Date(),
        mandateStatus: 'SUCCESS',
        currentStep: 'ESIGN',
      },
    });

    this.auditLogs
      .record({
        actorUserId: null,
        module: 'LOAN',
        action: 'EMANDATE_COMPLETED',
        entityType: 'PlLoan',
        entityId: loan.id.toString(),
        outcome: 'SUCCESS',
        requestId: randomBytes(16).toString('hex'),
      })
      .catch(() => {});

    return {
      success: true,
      message: 'e-Mandate set up successfully',
      nextStep: 'ESIGN',
      loan: {
        lan: updatedLoan.lan,
        mandateCompleted: updatedLoan.mandateCompleted,
        currentStep: 'ESIGN',
      },
    };
  }

  async getMandateStatus(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    return {
      success: true,
      status: loan.mandateStatus || (loan.mandateCompleted ? 'SUCCESS' : 'NOT_STARTED'),
      mandateCompleted: loan.mandateCompleted,
    };
  }

  async initiateEsign(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

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
