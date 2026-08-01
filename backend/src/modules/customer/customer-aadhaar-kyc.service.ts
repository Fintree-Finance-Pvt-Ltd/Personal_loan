import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { CustomerGender } from '@prisma/client';
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
      },
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
  async handleForwardedWebhook(input: {
    payload: Record<string, any>;
    webhookSecret?: string;
    webhookSource?: string;
    forwardedUniqueId?: string;
  }): Promise<Record<string, any>> {
    // ── 1. Validate forwarding secret ──────────────────────────────────────────
    this.validateWebhookSecret(input.webhookSecret);

    // ── 2. Validate source ────────────────────────────────────────────────────
    if (input.webhookSource && input.webhookSource !== 'lms-digitap-forwarder') {
      throw new UnauthorizedException('Invalid webhook source.');
    }

    // ── 3. Extract payload components ─────────────────────────────────────────
    const payload = input.payload || {};
    const data =
      payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, any>) : {};

    const uniqueId: string | null =
      (data.uniqueId as string | undefined) ||
      (payload.uniqueId as string | undefined) ||
      (payload.model?.uniqueId as string | undefined) ||
      input.forwardedUniqueId ||
      null;

    const transactionId: string | null =
      (payload.transactionId as string | undefined) ||
      (payload.model?.transactionId as string | undefined) ||
      null;

    // ── 4. Verify uniqueId belongs to PL ──────────────────────────────────────
    if (!uniqueId || !String(uniqueId).startsWith('DLK_CUS-')) {
      throw new BadRequestException('Webhook does not belong to Personal Loan.');
    }

    // ── 5. Safe structured log ──────────────────────────────────────────────────
    this.logger.log(
      `📥 [Aadhaar Webhook Received] TxID: ${transactionId}, UniqueID: ${uniqueId}, Status: ${payload.status || 'N/A'}, Source: ${input.webhookSource || 'DIRECT'}`,
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
    const normalizedStatus = String(payload.status || '')
      .trim()
      .toUpperCase();

    const isSuccess = ['SUCCESS', 'VERIFIED', 'COMPLETED'].includes(normalizedStatus);
    const isPending = ['PENDING', 'INITIATED', 'IN_PROGRESS'].includes(normalizedStatus);
    const isExpired = ['EXPIRED', 'TIMEOUT'].includes(normalizedStatus);
    const isFailure =
      !isSuccess && !isPending && !isExpired && normalizedStatus !== '';

    // ── 7. Find the KYC attempt via stored uniqueId or transactionId ─────────────
    const kycRecord = await this.prisma.kycVerificationStatus.findFirst({
      where: {
        OR: [
          ...(uniqueId ? [{ aadhaarUniqueId: String(uniqueId) }] : []),
          ...(transactionId ? [{ aadhaarTransactionId: String(transactionId) }] : []),
        ],
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
    if (previousStatus === 'VERIFIED' && customer.aadhaarVerified) {
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

      // Full webhook payload JSON string (sanitized of unmasked 12-digit numbers for compliance)
      const sanitizedPayload = this.sanitizePayloadForStorage(payload);
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
            // Only update fullName from Aadhaar if it is currently null
            ...(fullName && !customer.fullName ? { fullName } : {}),
          },
        });
      });

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
            webhookSource: input.webhookSource,
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
          aadhaarApiResponse: JSON.stringify(payload),
          aadhaarWebhookResponse: JSON.stringify(payload),
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
   * Timing-safe webhook secret validation.
   */
  private validateWebhookSecret(suppliedSecret?: string): void {
    const expectedSecret = this.config.get<string>('PL_WEBHOOK_SECRET');

    if (!expectedSecret) {
      // PL_WEBHOOK_SECRET not configured — reject all webhook calls
      throw new UnauthorizedException('Webhook endpoint is not configured.');
    }

    if (!suppliedSecret) {
      throw new UnauthorizedException('Webhook secret is missing.');
    }

    const suppliedBuffer = Buffer.from(suppliedSecret);
    const expectedBuffer = Buffer.from(expectedSecret);

    if (suppliedBuffer.length !== expectedBuffer.length) {
      throw new UnauthorizedException('Invalid webhook secret.');
    }

    if (!timingSafeEqual(suppliedBuffer, expectedBuffer)) {
      throw new UnauthorizedException('Invalid webhook secret.');
    }
  }

  /**
   * Normalizes provider details and updates Customer record atomically.
   * Used by manual refresh flow.
   */
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

    this.logger.log(`Aadhaar KYC successfully VERIFIED for customer ID: ${customerId}`);
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
