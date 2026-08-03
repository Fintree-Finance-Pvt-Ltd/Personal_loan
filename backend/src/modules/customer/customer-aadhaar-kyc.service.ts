import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CustomerGender, PlDocumentStatus, PlDocumentType } from '@prisma/client';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DigitapDigilockerService } from '../external-api/digitap-digilocker.service';
import { ConfigService } from '@nestjs/config';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class CustomerAadhaarKycService {
  private readonly logger = new Logger(CustomerAadhaarKycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly digitapService: DigitapDigilockerService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
  ) { }

  /**
   * Initiates DigiLocker Aadhaar KYC for pre-approval onboarding stage
   */
  async initiate(
    currentCustomer: any,
    body?: { consentGiven?: boolean },
  ) {
    if (!currentCustomer?.customerId) {
      throw new UnauthorizedException('Customer authentication is required.');
    }
    const customer = await this.prisma.customer.findUnique({
      where: { id: BigInt(currentCustomer.customerId) },
    });

    if (!customer) {
      throw new BadRequestException('Customer identity could not be resolved.');
    }

    if (!customer.customerCode) {
      throw new BadRequestException('Customer reference code is missing.');
    }

    if (!customer.mobileVerified) {
      throw new BadRequestException('Mobile verification must be completed before starting Aadhaar KYC.');
    }

    if (!customer.panVerified) {
      throw new BadRequestException('PAN verification must be completed before starting Aadhaar KYC.');
    }

    // Check if already verified
    if (customer.aadhaarVerified || customer.digilockerStatus === 'VERIFIED') {
      return {
        success: true,
        data: {
          status: 'VERIFIED',
          aadhaarVerified: true,
          maskedAadhaar: customer.maskedAadhaar || null,
          aadhaarLastFourDigits: customer.aadhaarLastFourDigits || null,
          verifiedAt: customer.aadhaarVerifiedAt || customer.digilockerVerifiedAt || null,
          message: 'Aadhaar KYC is already verified.',
        },
      };
    }

    // Create unique attempt reference using customerCode — starts with DLK_CUS- for LMS forwarder routing
    const attemptReference = `DLK_CUS-${customer.customerCode}_${Date.now()}`;

    // Call DigiLocker provider URL generation
    const response = await this.digitapService.generateDigitapDigilockerUrl({
      uid: attemptReference,
      mobile: customer.mobileNumber || undefined,
      emailId: customer.email || undefined,
      firstName: customer.firstName || customer.fullName || undefined,
      lastName: customer.lastName || undefined,
      redirectionUrl:
        this.config.get<string>('DIGITAP_DIGILOCKER_REDIRECT_URL') ||
        'http://localhost:5173/customer/digilocker/callback',
    });

    // Persist attempt reference and transaction ID in KycVerificationStatus (upsert for idempotency)
    await this.prisma.kycVerificationStatus.upsert({
      where: { customerId: customer.id },
      create: {
        customerId: customer.id,
        aadhaarStatus: 'INITIATED',
        aadhaarUniqueId: attemptReference,
        aadhaarTransactionId: response.transactionId || null,
      },
      update: {
        aadhaarStatus: 'INITIATED',
        aadhaarUniqueId: attemptReference,
        aadhaarTransactionId: response.transactionId || null,
      },
    });

    // Update customer record with initiation details
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        digilockerStatus: 'INITIATED',
        aadhaarKycStatus: 'INITIATED',
        digilockerSessionId: response.transactionId,
        digilockerReference: attemptReference,
        digilockerConsentAt: new Date(),
      },
    });

    this.logger.log(
      `DigiLocker KYC initiated for customer ${customer.customerCode} (Ref: ${attemptReference})`,
    );

    return {
      success: true,
      data: {
        status: 'INITIATED',
        verificationUrl: response.url || response.kycUrl,
        transactionId: response.transactionId,
        attemptReference,
        customerCode: customer.customerCode,
        pollAfterSeconds: 5,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
    };
  }

  /**
   * Retrieves current Aadhaar KYC status for authenticated customer
   */
  async getStatus(
    currentCustomer: any,
  ) {
    if (!currentCustomer?.customerId) {
      throw new UnauthorizedException('Customer authentication is required.');
    }
    const customer = await this.prisma.customer.findUnique({
      where: { id: BigInt(currentCustomer.customerId) },
    });

    if (!customer) {
      throw new NotFoundException('Customer identity could not be resolved.');
    }

    const kycRecord = await this.prisma.kycVerificationStatus.findUnique({
      where: { customerId: customer.id },
    });
    const aadhaarSnapshot = this.readAadhaarSnapshot(kycRecord?.aadhaarApiResponse);
    const permanentAddress = aadhaarSnapshot?.address
      ? this.mapAadhaarAddress(aadhaarSnapshot.address)
      : kycRecord?.aadhaarAddress
        ? { formattedAddress: kycRecord.aadhaarAddress }
        : null;
    const isCurrentSameAsAadhaar = Boolean(
      permanentAddress?.pincode &&
      customer.residentialPincode === permanentAddress.pincode &&
      customer.residentialCity === permanentAddress.city &&
      customer.residentialState === permanentAddress.state,
    );

    const isVerified = Boolean(customer.aadhaarVerified || customer.digilockerStatus === 'VERIFIED');
    const currentStatus = isVerified
      ? 'VERIFIED'
      : customer.aadhaarKycStatus || customer.digilockerStatus || 'NOT_STARTED';

    return {
      success: true,
      data: {
        customerCode: customer.customerCode,
        status: currentStatus,
        aadhaarVerified: isVerified,
        maskedAadhaar: customer.maskedAadhaar || null,
        aadhaarLastFourDigits: customer.aadhaarLastFourDigits || null,
        verifiedAt: customer.aadhaarVerifiedAt || customer.digilockerVerifiedAt || null,
        fullName: customer.fullName || null,
        transactionId: customer.digilockerSessionId || null,
        permanentAddress,
        currentAddress: isCurrentSameAsAadhaar ? permanentAddress : null,
        currentAddressSameAsPermanent: isCurrentSameAsAadhaar,
      },
    };
  }

  async saveCurrentAddressSameAsAadhaar(currentCustomer: any, body: any) {
    const rawCustomerId = currentCustomer?.customerId || body?.customerId;
    if (!rawCustomerId) throw new BadRequestException('Customer identity could not be resolved.');
    const customerId = BigInt(rawCustomerId);
    const kycRecord = await this.prisma.kycVerificationStatus.findUnique({ where: { customerId } });
    if (!kycRecord || kycRecord.aadhaarStatus !== 'VERIFIED') {
      throw new BadRequestException('Aadhaar KYC must be verified first.');
    }
    const snapshot = this.readAadhaarSnapshot(kycRecord.aadhaarApiResponse);
    if (!snapshot?.address) throw new BadRequestException('Aadhaar address is not available.');
    const mapped = this.mapAadhaarAddress(snapshot.address);

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        residentialPincode: mapped.pincode || undefined,
        residentialCity: mapped.city || undefined,
        residentialState: mapped.state || undefined,
        lastActivityAt: new Date(),
      },
    });
    await this.prisma.plLoan.updateMany({
      where: { customerId },
      data: {
        addressSameAsPermanent: true,
        currentAddrLine1: mapped.addressLine1 || null,
        currentAddrLine2: mapped.addressLine2 || null,
        currentAddrLandmark: mapped.landmark || null,
        currentAddrLocality: mapped.locality || null,
        currentAddrDistrict: mapped.district || null,
        currentAddrCity: mapped.city || null,
        currentAddrState: mapped.state || null,
        currentAddrCountry: mapped.country || 'India',
        currentAddrPincode: mapped.pincode || null,
        currentAddrProofType: 'AADHAAR',
      },
    });
    return {
      success: true,
      message: 'Current address saved from Aadhaar successfully.',
      data: { currentAddress: mapped, sameAsPermanent: true },
    };
  }

  /**
  /**
   * Manually checks & updates live DigiLocker status with provider
   */
  async refreshStatus(
    currentCustomer: any,
  ) {
    if (!currentCustomer?.customerId) {
      throw new UnauthorizedException('Customer authentication is required.');
    }
    const customer = await this.prisma.customer.findUnique({
      where: { id: BigInt(currentCustomer.customerId) },
    });

    if (!customer) {
      throw new NotFoundException('Customer identity could not be resolved.');
    }

    if (customer.aadhaarVerified || customer.digilockerStatus === 'VERIFIED') {
      return this.getStatus(currentCustomer);
    }

    const transactionId = customer.digilockerSessionId;
    if (!transactionId) {
      return this.getStatus(currentCustomer);
    }

    try {
      const providerDetails = await this.digitapService.getDigitapDigilockerDetails(transactionId);
      if (providerDetails) {
        await this.processAndPersistVerifiedDetails(customer.id, providerDetails);
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed to refresh DigiLocker status for customer ${customer.customerCode}: ${error?.message}`,
      );
    }

    return this.getStatus(currentCustomer);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FORWARDED WEBHOOK — from LMS Digitap forwarder
  // Route: POST /api/customer/aadhaar-kyc/digilocker/webhook
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handles a forwarded Aadhaar DigiLocker webhook from the LMS Digitap forwarder.
   *
   * Rules:
   * - Validates x-pl-webhook-secret using timing-safe comparison
   * - Validates x-webhook-source = lms-digitap-forwarder
   * - Accepts only uniqueIds starting with DLK_CUS-
   * - Resolves customer via KycVerificationStatus.aadhaarUniqueId
   * - Never stores full Aadhaar number, OTP, PDF, XML
   * - Fully idempotent: VERIFIED is final
   */
  async handleDigitapWebhook(payload: any): Promise<Record<string, any>> {
    // ── 1. Validate forwarding secret ──────────────────────────────────────────
    // ── 2. Validate source ────────────────────────────────────────────────────
    // ── 3. Extract payload components ─────────────────────────────────────────
    payload = payload || {};
    let data =
      payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, any>) : {};

    const uniqueId: string | null =
      (data.uniqueId as string | undefined) ||
      (payload.uniqueId as string | undefined) ||
      (payload.model?.uniqueId as string | undefined) ||
      null;

    const transactionId: string | null =
      (payload.transactionId as string | undefined) ||
      (data.transactionId as string | undefined) ||
      (payload.model?.transactionId as string | undefined) ||
      null;

    // ── 4. Verify uniqueId belongs to PL ──────────────────────────────────────
    if (!transactionId) {
      this.logger.warn('Digitap DigiLocker webhook ignored: missing transactionId');
      return {
        success: true,
        message: 'Webhook ignored because transactionId is missing.',
        data: { processed: false },
      };
    }

    // ── 5. Safe structured log ──────────────────────────────────────────────────
    this.logger.log(
      `[Aadhaar Webhook Received] TxID: ${transactionId}, Status: ${payload.status || 'N/A'}, Source: DIRECT_DIGITAP`,
    );

    this.logger.log({
      event: 'AADHAAR_KYC_WEBHOOK_RECEIVED',
      transactionId,
      uniqueId,
      status: payload.status || null,
      hasPdf: Boolean(data.pdfLink),
      hasXml: Boolean(data.link),
    });

    // ── 6. Normalise provider status ──────────────────────────────────────────
    const rawStatus = payload.status || data.status || payload.model?.status || payload.code || '';
    const normalizedStatus = String(rawStatus)
      .trim()
      .toUpperCase();

    const isSuccess = ['S', 'SUCCESS', 'SUCCESSFUL', 'VERIFIED', 'COMPLETED', '200'].includes(normalizedStatus);
    const isPending = ['PENDING', 'INITIATED', 'IN_PROGRESS'].includes(normalizedStatus);
    const isExpired = ['EXPIRED', 'TIMEOUT'].includes(normalizedStatus);
    const isFailure =
      !isSuccess && !isPending && !isExpired && normalizedStatus !== '';

    // ── 7. Find the KYC attempt via stored uniqueId or transactionId ─────────────
    const kycRecord = await this.prisma.kycVerificationStatus.findFirst({
      where: {
        aadhaarTransactionId: String(transactionId),
      },
      include: { customer: true },
    });

    if (!kycRecord) {
      this.logger.warn({
        event: 'AADHAAR_KYC_WEBHOOK_NO_MATCH',
        uniqueId,
        transactionId,
      });
      return {
        success: true,
        message: 'Webhook received but no matching PL Aadhaar attempt was found.',
        data: { uniqueId, processed: false },
      };
    }

    const customer = kycRecord.customer;
    const previousStatus = kycRecord.aadhaarStatus;

    // ── 8. Idempotency: VERIFIED is final ─────────────────────────────────────
    if (previousStatus === 'VERIFIED' && customer.aadhaarVerified && !isSuccess) {
      this.logger.log({
        event: 'AADHAAR_KYC_WEBHOOK_DUPLICATE',
        uniqueId,
        transactionId,
        customerCode: customer.customerCode,
      });
      return {
        success: true,
        message: 'Webhook already processed.',
        data: { uniqueId, processed: true, duplicate: true },
      };
    }

    // ── 9. Success path ───────────────────────────────────────────────────────
    if (isSuccess) {
      // Never trust a success webhook by itself. Fetch the authoritative result
      // from Digitap and bind it to the exact UID stored for this attempt.
      let providerResponse: any;
      try {
        providerResponse = await this.digitapService.getDigitapDigilockerDetails(transactionId);
      } catch (error: any) {
        this.logger.error(`Authoritative DigiLocker verification failed for TxID ${transactionId}: ${error?.message}`);
        return {
          success: true,
          message: 'Webhook acknowledged; provider verification is pending.',
          data: { transactionId, processed: false },
        };
      }

      const providerModel = providerResponse?.model || providerResponse?.data || providerResponse || {};
      const providerData = providerModel?.aadhaarData || providerModel?.kycData || providerModel?.data || providerModel;
      const authoritativeUniqueId = String(providerData?.uniqueId || providerData?.uid || '').trim();
      const authoritativeStatus = String(providerData?.status || providerModel?.status || providerResponse?.status || '').trim().toUpperCase();

      if (!authoritativeUniqueId || authoritativeUniqueId !== String(kycRecord.aadhaarUniqueId || '') || !authoritativeUniqueId.startsWith('DLK_CUS-')) {
        this.logger.warn(`Digitap DigiLocker uniqueId mismatch for TxID ${transactionId}`);
        return {
          success: true,
          message: 'Webhook acknowledged but authoritative attempt validation failed.',
          data: { transactionId, processed: false },
        };
      }

      if (!['S', 'SUCCESS', 'SUCCESSFUL', 'VERIFIED', 'COMPLETED', '200'].includes(authoritativeStatus)) {
        return {
          success: true,
          message: 'Webhook acknowledged; authoritative KYC is not successful.',
          data: { transactionId, processed: false, status: authoritativeStatus || 'UNKNOWN' },
        };
      }

      data = providerData;
      // Extract permitted fields only — never full Aadhaar
      const maskedAadhaar: string | null =
        (data.maskedAdharNumber as string | undefined) ||
        (data.maskedAadhaar as string | undefined) ||
        null;

      const aadhaarLastFour: string | null = maskedAadhaar
        ? String(maskedAadhaar).replace(/\D/g, '').slice(-4) || null
        : null;

      const fullName: string | null = (data.name as string | undefined) || null;
      const genderRaw: string | null = (data.gender as string | undefined) || null;
      const gender: CustomerGender | null = this.mapGender(genderRaw);

      // Safe DOB parse from DD-MM-YYYY
      let dateOfBirth: Date | null = null;
      const rawDob = data.dob as string | undefined;
      if (rawDob) {
        try {
          const parts = rawDob.split(/[-/]/);
          if (parts.length === 3) {
            dateOfBirth =
              parts[0].length === 4
                ? new Date(`${parts[0]}-${parts[1]}-${parts[2]}`)
                : new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            if (isNaN(dateOfBirth.getTime())) dateOfBirth = null;
          }
        } catch {
          dateOfBirth = null;
        }
      }

      // Format Aadhaar address string matching LMS format
      const addr = (data.address && typeof data.address === 'object' ? data.address : {}) as Record<string, any>;
      const aadhaarAddressStr: string | null = typeof data.address === 'string'
        ? data.address
        : data.address
          ? [
            addr.house || addr.careOf || addr.co,
            addr.street,
            addr.loc || addr.vtc,
            addr.dist || addr.subdist,
            addr.state,
            addr.pc ? `- ${addr.pc}` : null,
          ]
            .filter(Boolean)
            .join(', ')
            .replace(/,\s*,/g, ',')
            .replace(/^,\s*/g, '')
            .trim() || JSON.stringify(data.address)
          : null;

      // Persist the provider-hosted signed XML and DigiLocker PDF before their
      // temporary URLs expire. Existing records are updated idempotently.
      await this.storeDigitapDocuments(
        customer.id,
        transactionId,
        data,
        aadhaarAddressStr,
        addr,
      );

      // Full webhook payload JSON string (sanitized of unmasked 12-digit numbers for compliance)
      const sanitizedPayload = this.sanitizePayloadForStorage(providerResponse);
      const fullWebhookPayloadStr = JSON.stringify(sanitizedPayload);

      // Atomic transaction
      await this.prisma.$transaction(async (tx) => {
        // Double-check inside transaction for race conditions
        const freshKyc = await tx.kycVerificationStatus.findUnique({
          where: { id: kycRecord.id },
        });
        if (freshKyc?.aadhaarStatus === 'VERIFIED') return;

        // Update KycVerificationStatus with Aadhaar KYC data
        await tx.kycVerificationStatus.update({
          where: { id: kycRecord.id },
          data: {
            aadhaarStatus: 'VERIFIED',
            aadhaarTransactionId: transactionId,
            aadhaarMaskedNumber: maskedAadhaar,
            aadhaarName: fullName,
            aadhaarDob: dateOfBirth,
            aadhaarAddress: aadhaarAddressStr,
            aadhaarApiResponse: fullWebhookPayloadStr,
            aadhaarWebhookResponse: fullWebhookPayloadStr,
          },
        });

        // Update Customer with verified Aadhaar fields
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            aadhaarVerified: true,
            aadhaarKycStatus: 'VERIFIED',
            digilockerStatus: 'VERIFIED',
            maskedAadhaar,
            aadhaarLastFourDigits: aadhaarLastFour,
            aadhaarVerifiedAt: new Date(),
            digilockerVerifiedAt: new Date(),
            residentialPincode: addr.pc ? String(addr.pc).slice(0, 6) : undefined,
            residentialCity: (addr.vtc || addr.po || addr.dist) ? String(addr.vtc || addr.po || addr.dist) : undefined,
            residentialState: addr.state ? String(addr.state) : undefined,
            // Only update fullName from Aadhaar if it is currently null
            ...(fullName && !customer.fullName ? { fullName } : {}),
          },
        });
        // Also propagate verified Aadhaar details to any active loan records for this customer
        await tx.plLoan.updateMany({
          where: {
            customerId: customer.id,
            NOT: { digilockerStatus: 'VERIFIED' },
          },
          data: {
            digilockerStatus: 'VERIFIED',
            aadhaarMaskedNumber: maskedAadhaar,
            aadhaarLastFour: aadhaarLastFour,
            aadhaarVerifiedName: fullName,
            aadhaarDateOfBirth: dateOfBirth,
            aadhaarGender: gender ? String(gender) : null,
            aadhaarCareOf: addr.co || addr.careOf || null,
            aadhaarAddrLine1: addr.house || null,
            aadhaarAddrLine2: addr.street || null,
            aadhaarLandmark: addr.landmark || null,
            aadhaarLocality: addr.loc || addr.vtc || null,
            aadhaarDistrict: addr.dist || addr.subdist || null,
            aadhaarCity: addr.vtc || addr.po || null,
            aadhaarState: addr.state || null,
            aadhaarCountry: addr.country || 'India',
            aadhaarPincode: addr.pc ? String(addr.pc).slice(0, 6) : null,
            aadhaarFormattedAddr: aadhaarAddressStr,
            digilockerVerifiedAt: new Date(),
            digilockerRawResponse: fullWebhookPayloadStr,
            currentStep: 'ADDRESS_CONFIRMATION',
            status: 'KYC_IN_PROGRESS',
          },
        });
      });
      await this.snapshotVerifiedApplicationKyc(customer.id, transactionId, fullName, addr);

      // Audit log (non-blocking)
      this.auditLogs
        .record({
          module: 'AADHAAR_KYC',
          action: 'AADHAAR_KYC_VERIFIED',
          entityType: 'Customer',
          entityId: String(customer.id),
          outcome: 'SUCCESS',
          reason: 'DigiLocker webhook: VERIFIED',
          previousValue: { aadhaarStatus: previousStatus },
          newValue: {
            aadhaarStatus: 'VERIFIED',
            maskedAadhaar,
            transactionId,
            uniqueId,
            webhookSource: 'DIRECT_DIGITAP',
          },
          requestId: `webhook-${transactionId || uniqueId}`,
        })
        .catch((err) => this.logger.error(`Audit log failed: ${err?.message}`));

      this.logger.log({
        event: 'AADHAAR_KYC_VERIFIED',
        customerCode: customer.customerCode,
        uniqueId,
        transactionId,
      });

      const responseObj = {
        success: true,
        message: 'Personal Loan DigiLocker webhook processed successfully.',
        data: {
          uniqueId,
          transactionId,
          status: normalizedStatus,
          processed: true,
        },
      };

      this.logger.log(
        `✅ [Aadhaar Webhook Processed] Customer: ${customer.customerCode}, Result: ${JSON.stringify(responseObj)}`,
      );

      return responseObj;
    }

    // ── 10. Failure / Expired path ────────────────────────────────────────────
    if (isFailure || isExpired) {
      const newKycStatus = isExpired ? 'FAILED' : 'FAILED';
      const failureCode =
        (data.failureCode as string | undefined) ||
        (payload.failureCode as string | undefined) ||
        null;
      const failureMessage =
        (data.failureMessage as string | undefined) ||
        (payload.failureMessage as string | undefined) ||
        null;

      await this.prisma.kycVerificationStatus.update({
        where: { id: kycRecord.id },
        data: {
          aadhaarStatus: 'FAILED',
          aadhaarTransactionId: transactionId,
          aadhaarApiResponse: JSON.stringify(this.sanitizePayloadForStorage(payload)),
          aadhaarWebhookResponse: JSON.stringify(this.sanitizePayloadForStorage(payload)),
        },
      });

      // Update customer kyc status (but NOT aadhaarVerified — stays false)
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          aadhaarKycStatus: 'FAILED',
          digilockerStatus: 'FAILED',
        },
      });

      this.auditLogs
        .record({
          module: 'AADHAAR_KYC',
          action: isExpired ? 'AADHAAR_KYC_EXPIRED' : 'AADHAAR_KYC_FAILED',
          entityType: 'Customer',
          entityId: String(customer.id),
          outcome: 'FAILURE',
          reason: failureCode || normalizedStatus,
          previousValue: { aadhaarStatus: previousStatus },
          newValue: {
            aadhaarStatus: 'FAILED',
            failureCode,
            transactionId,
            uniqueId,
          },
          requestId: `webhook-${transactionId || uniqueId}`,
        })
        .catch((err) => this.logger.error(`Audit log failed: ${err?.message}`));

      this.logger.log({
        event: isExpired ? 'AADHAAR_KYC_EXPIRED' : 'AADHAAR_KYC_FAILED',
        customerCode: customer.customerCode,
        uniqueId,
        transactionId,
        failureCode,
      });
    }

    // Pending — just acknowledge
    return {
      success: true,
      message: 'Personal Loan DigiLocker webhook processed successfully.',
      data: {
        uniqueId,
        transactionId,
        status: normalizedStatus,
        processed: true,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Normalizes provider details and updates Customer record atomically.
   * Used by manual refresh flow.
   */
  private readAadhaarSnapshot(rawResponse?: string | null): any {
    if (!rawResponse) return null;
    try {
      const response = JSON.parse(rawResponse);
      const model = response?.model || response?.data || response || {};
      return model?.aadhaarData || model?.kycData || model?.data || model;
    } catch {
      return null;
    }
  }

  private mapAadhaarAddress(address: any): any {
    const value = address && typeof address === 'object' ? address : {};
    const mapped = {
      addressLine1: value.house || '',
      addressLine2: value.street || '',
      landmark: value.landmark || value.lm || '',
      locality: value.loc || '',
      district: value.dist || value.subdist || '',
      city: value.vtc || value.po || value.dist || '',
      state: value.state || '',
      country: value.country || 'India',
      pincode: value.pc ? String(value.pc).slice(0, 6) : '',
      formattedAddress: '',
    };
    mapped.formattedAddress = [mapped.addressLine1, mapped.addressLine2, mapped.landmark, mapped.locality, mapped.city, mapped.district, mapped.state, mapped.pincode, mapped.country]
      .filter(Boolean).join(', ');
    return mapped;
  }

  private async storeDigitapDocuments(
    customerId: bigint,
    transactionId: string,
    providerData: any,
    formattedAddress: string | null,
    address: any,
  ): Promise<void> {
    const files = Array.isArray(providerData?.digilockerFiles)
      ? providerData.digilockerFiles
      : Array.isArray(providerData?.digilockerFileInfos) ? providerData.digilockerFileInfos : [];
    const xml = files.find((item: any) => String(item?.docExtension || '').toLowerCase() === 'xml');
    const pdf = files.find((item: any) => String(item?.docExtension || '').toLowerCase() === 'pdf');
    const documents = [
      { type: PlDocumentType.OTHER, extension: 'xml', mimeType: 'application/xml', source: xml?.docLink || providerData?.xmlLink || providerData?.xmlResponse || null },
      { type: PlDocumentType.AADHAAR_CARD, extension: 'pdf', mimeType: 'application/pdf', source: pdf?.docLink || providerData?.pdfLink || null },
    ];
    const now = new Date();
    const relativeDir = path.join('uploads', 'customer-documents', 'digilocker', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    const targetDir = path.join(process.cwd(), relativeDir);
    fs.mkdirSync(targetDir, { recursive: true });

    for (const document of documents) {
      if (!document.source) continue;
      try {
        const buffer = await this.resolveDigitapDocument(document.source, document.extension);
        if (!buffer.length || buffer.length > 10 * 1024 * 1024) continue;
        const fileName = `digilocker-${transactionId}-${randomBytes(4).toString('hex')}.${document.extension}`;
        const filePath = path.join(targetDir, fileName);
        const fileUrl = `/${relativeDir.replace(/\\/g, '/')}/${fileName}`;
        fs.writeFileSync(filePath, buffer);

        const existing = await this.prisma.plCustomerDocument.findFirst({
          where: { customerId, documentType: document.type, source: 'DIGITAP_DIGILOCKER', metadataJson: { contains: `\"extension\":\"${document.extension}\"` } },
        });
        const record = {
          documentType: document.type,
          applicantType: 'BORROWER',
          status: PlDocumentStatus.VERIFIED,
          fileName,
          originalFileName: document.extension === 'pdf' ? 'DIGILOCKER_PDF.pdf' : 'AADHAAR.xml',
          filePath,
          fileUrl,
          mimeType: document.mimeType,
          fileSize: buffer.length,
          source: 'DIGITAP_DIGILOCKER',
          formattedAddress,
          city: address?.vtc || address?.po || address?.dist || null,
          state: address?.state || null,
          country: address?.country || 'India',
          postalCode: address?.pc ? String(address.pc) : null,
          metadataJson: JSON.stringify({ provider: 'DIGITAP', transactionId, extension: document.extension }),
        };
        if (existing) await this.prisma.plCustomerDocument.update({ where: { id: existing.id }, data: record });
        else await this.prisma.plCustomerDocument.create({ data: { customerId, ...record } });
      } catch (error: any) {
        this.logger.error(`Failed to store DigiLocker ${document.extension.toUpperCase()}: ${error?.message}`);
      }
    }
  }

  private async resolveDigitapDocument(source: string, extension: string): Promise<Buffer> {
    if (source.startsWith('https://') || source.startsWith('http://')) {
      const url = new URL(source);
      if (['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'].includes(url.hostname)) throw new BadRequestException('Invalid DigiLocker document URL.');
      const response = await axios.get(source, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 10 * 1024 * 1024 });
      return Buffer.from(response.data);
    }
    if (extension === 'xml' && source.trim().startsWith('<?xml')) return Buffer.from(source, 'utf8');
    return Buffer.from(source.replace(/^data:[^;]+;base64,/, ''), 'base64');
  }

  private async processAndPersistVerifiedDetails(customerId: bigint, providerResponse: any) {
    const model = providerResponse?.model || providerResponse?.data || providerResponse;
    const aadhaarData = model?.aadhaarData || model?.kycData || model?.data || model;

    const maskedAadhaarRaw =
      (aadhaarData?.maskedAdharNumber as string | undefined) ||
      (aadhaarData?.maskedAadhaar as string | undefined) ||
      (aadhaarData?.aadhaarNumber as string | undefined) ||
      (model?.maskedAdharNumber as string | undefined) ||
      (model?.maskedAadhaar as string | undefined) ||
      '';

    const lastFour = maskedAadhaarRaw.replace(/\D/g, '').slice(-4) || 'XXXX';
    const maskedAadhaar = lastFour !== 'XXXX' ? `XXXX-XXXX-${lastFour}` : 'XXXX-XXXX-XXXX';

    const verifiedName: string | null =
      (aadhaarData?.name as string | undefined) ||
      (model?.name as string | undefined) ||
      null;

    const verifiedDob: string | null =
      (aadhaarData?.dob as string | undefined) ||
      (model?.dob as string | undefined) ||
      null;

    const verifiedGender: string | null =
      (aadhaarData?.gender as string | undefined) ||
      (model?.gender as string | undefined) ||
      null;

    let dobDate: Date | null = null;
    if (verifiedDob) {
      try {
        const parts = verifiedDob.split(/[-/]/);
        if (parts.length === 3) {
          dobDate =
            parts[0].length === 4
              ? new Date(`${parts[0]}-${parts[1]}-${parts[2]}`)
              : new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          if (isNaN(dobDate.getTime())) dobDate = null;
        }
      } catch {
        dobDate = null;
      }
    }

    const sanitizedResponseStr = JSON.stringify(this.sanitizePayloadForStorage(providerResponse));

    const addr = (aadhaarData?.address && typeof aadhaarData.address === 'object' ? aadhaarData.address : {}) as Record<string, any>;
    const aadhaarAddressStr: string | null = typeof aadhaarData?.address === 'string'
      ? aadhaarData.address
      : aadhaarData?.address
        ? [
          addr.house || addr.careOf || addr.co,
          addr.street,
          addr.loc || addr.vtc,
          addr.dist || addr.subdist,
          addr.state,
          addr.pc ? `- ${addr.pc}` : null,
        ]
          .filter(Boolean)
          .join(', ')
          .replace(/,\s*,/g, ',')
          .replace(/^,\s*/g, '')
          .trim() || JSON.stringify(aadhaarData.address)
        : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          aadhaarVerified: true,
          aadhaarKycStatus: 'VERIFIED',
          digilockerStatus: 'VERIFIED',
          maskedAadhaar,
          aadhaarLastFourDigits: lastFour,
          aadhaarVerifiedAt: new Date(),
          digilockerVerifiedAt: new Date(),
          ...(verifiedName ? { fullName: verifiedName } : {}),
          ...(dobDate ? { dateOfBirth: dobDate } : {}),
          ...(verifiedGender ? { gender: this.mapGender(verifiedGender) } : {}),
        },
      });

      const kycRecord = await tx.kycVerificationStatus.findFirst({
        where: { customerId },
      });

      if (kycRecord) {
        await tx.kycVerificationStatus.update({
          where: { id: kycRecord.id },
          data: {
            aadhaarStatus: 'VERIFIED',
            aadhaarName: verifiedName || kycRecord.aadhaarName,
            aadhaarMaskedNumber: maskedAadhaar !== 'XXXX-XXXX-XXXX' ? maskedAadhaar : kycRecord.aadhaarMaskedNumber,
            aadhaarDob: dobDate || kycRecord.aadhaarDob,
            aadhaarAddress: aadhaarAddressStr || kycRecord.aadhaarAddress,
            aadhaarApiResponse: sanitizedResponseStr,
          },
        });
      }
    });

    await this.snapshotVerifiedApplicationKyc(customerId, String(aadhaarData?.transactionId || aadhaarData?.referenceId || `DIGILOCKER-${customerId}`), verifiedName, addr);

    this.logger.log(`Aadhaar KYC successfully VERIFIED for customer ID: ${customerId}`);
  }

  private async snapshotVerifiedApplicationKyc(customerId: bigint, providerReference: string, verifiedName: string | null, address: Record<string, any>) {
    const application = await this.prisma.plApplication.findFirst({ where: { customerId }, orderBy: { id: 'desc' } });
    if (!application) return;
    const verifiedAt = new Date();
    await this.prisma.applicationKycSnapshot.upsert({
      where: { applicationId: application.id },
      create: { applicationId: application.id, provider: 'DIGITAP_DIGILOCKER', providerReference, verificationStatus: 'VERIFIED', verifiedName, verifiedAt },
      update: { provider: 'DIGITAP_DIGILOCKER', providerReference, verificationStatus: 'VERIFIED', verifiedName, verifiedAt },
    });
    const addressLine1 = String(address.house || address.careOf || address.co || address.street || '').trim();
    const city = String(address.vtc || address.city || address.dist || '').trim();
    const state = String(address.state || '').trim();
    const pincode = String(address.pc || address.pincode || '').trim();
    if (addressLine1 && city && state && /^[1-9][0-9]{5}$/.test(pincode)) {
      await this.prisma.applicationAddress.upsert({
        where: { applicationId_addressType: { applicationId: application.id, addressType: 'PERMANENT' } },
        create: { applicationId: application.id, addressType: 'PERMANENT', source: 'DIGILOCKER', addressLine1, addressLine2: address.street || null, locality: address.loc || null, district: address.dist || null, city, state, pincode, country: address.country || 'India', sourceVerifiedAt: verifiedAt },
        update: { source: 'DIGILOCKER', addressLine1, addressLine2: address.street || null, locality: address.loc || null, district: address.dist || null, city, state, pincode, country: address.country || 'India', sourceVerifiedAt: verifiedAt },
      });
    }
  }

  /**
   * Maps provider gender string (M/F/MALE/FEMALE/OTHER) to CustomerGender enum.
   */
  private mapGender(raw: string | null | undefined): CustomerGender | null {
    if (!raw) return null;
    const upper = String(raw).trim().toUpperCase();
    if (upper === 'M' || upper === 'MALE') return CustomerGender.MALE;
    if (upper === 'F' || upper === 'FEMALE') return CustomerGender.FEMALE;
    if (upper === 'OTHER' || upper === 'O') return CustomerGender.OTHER;
    return null;
  }

  /**
   * Redacts 12-digit unmasked Aadhaar numbers from stored JSON payloads.
   */
  private sanitizePayloadForStorage(payload: Record<string, any>): Record<string, any> {
    if (!payload || typeof payload !== 'object') return {};

    const copy = JSON.parse(JSON.stringify(payload));
    const maskRecursive = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
          const val = obj[key].trim();
          if (/^\d{12}$/.test(val)) {
            obj[key] = `XXXX-XXXX-${val.slice(-4)}`;
          }
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          maskRecursive(obj[key]);
        }
      }
    };

    maskRecursive(copy);
    return copy;
  }
}
