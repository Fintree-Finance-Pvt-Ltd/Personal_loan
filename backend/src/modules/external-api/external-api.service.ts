import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import {
  CustomerGender,
  CustomerOnboardingStatus,
  KycStatus,
  PlBankVerificationStatus,
  PlBankAccountType,
  PlLoanStatus,
} from '@prisma/client';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { AxiosError, AxiosResponse } from 'axios';
import * as FormData from 'form-data';
import { LenderIntegrationOutboxService } from '../lender-integrations/lender-integration-outbox.service';
import { LosRejectionWebhookService } from '../lender-integrations/los-rejection-webhook.service';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DigioBankService } from './integrations/digio-bank.service';
import {
  encryptBankAccountNumber,
  decryptBankAccountNumber,
  createBankAccountFingerprint,
  maskBankAccountNumber,
  maskIfscForAudit,
} from '../../common/utils/bank-security.helper';
import { signDocumentUrl } from '../../common/utils/document-url-signer.helper';
import { namesLikelyMatch } from '../../common/utils/name-matcher.helper';
import {
  FinanalyzPanResponse,
  NormalizedPanVerificationData,
} from './interfaces/pan-verification.interface';
import {
  DigitapFaceLivenessResponse,
  VerifyFaceLivenessInput,
} from './interfaces/face-liveness.interface';

@Injectable()
export class ExternalApiService {
  private readonly logger = new Logger(ExternalApiService.name);

  // PAN Configuration
  private readonly panApiUrl: string;
  private readonly panApiKey: string;
  private readonly panApiTimeoutMs: number;

  // PAN OCR Configuration
  private readonly panOcrApiUrl: string;
  private readonly panOcrApiKey: string;

  // ZOOP PAN Configuration (Fallback)
  private readonly zoopPanApiUrl: string;
  private readonly zoopApiKey: string;
  private readonly zoopAppId: string;

  // Face Liveness Configuration
  private readonly faceLivenessApiUrl: string;
  private readonly faceLivenessAuthHeader: string;
  private readonly faceLivenessTimeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly digioBankService: DigioBankService,
    private readonly lenderIntegrationOutbox: LenderIntegrationOutboxService,
    @Optional() private readonly losRejectionWebhookService?: LosRejectionWebhookService,
  ) {
    // PAN API Setup
    this.panApiUrl = this.configService.getOrThrow<string>('PAN_API_URL');
    this.panApiKey = this.configService.getOrThrow<string>('PAN_API_KEY');
    this.panApiTimeoutMs = Number(
      this.configService.get<string>('PAN_API_TIMEOUT_MS', '15000'),
    );

    this.panOcrApiUrl = this.configService.get<string>('PAN_OCR_API_URL') || 'https://sandbox.fintreelms.com/ocr/v1/pan';
    this.panOcrApiKey = this.configService.get<string>('PAN_OCR_API_KEY') || 'Fintree@2026';

    // ZOOP PAN API Setup (Fallback)
    this.zoopPanApiUrl = this.configService.get<string>('ZOOP_PAN_API_URL') || 'https://test.zoop.one/api/v1/in/identity/pan/advance';
    this.zoopApiKey = this.configService.get<string>('ZOOP_API_KEY') || '';
    this.zoopAppId = this.configService.get<string>('ZOOP_APP_ID') || '';

    if (!Number.isFinite(this.panApiTimeoutMs) || this.panApiTimeoutMs <= 0) {
      throw new InternalServerErrorException(
        'PAN_API_TIMEOUT_MS must be a positive number.',
      );
    }

    // Face Liveness API Setup
    this.faceLivenessApiUrl = this.configService.getOrThrow<string>('FACE_LIVENESS_API_URL');
    const clientId = this.configService.getOrThrow<string>('FACE_LIVENESS_CLIENT_ID');
    const clientSecret = this.configService.getOrThrow<string>('FACE_LIVENESS_CLIENT_SECRET');
    
    // Authorization header formatted as Basic Base64(client_id:client_secret)
    const authCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    this.faceLivenessAuthHeader = `Basic ${authCredentials}`;

    this.faceLivenessTimeoutMs = Number(
      this.configService.get<string>('FACE_LIVENESS_API_TIMEOUT_MS', '15000'),
    );

    if (!Number.isFinite(this.faceLivenessTimeoutMs) || this.faceLivenessTimeoutMs <= 0) {
      throw new InternalServerErrorException(
        'FACE_LIVENESS_API_TIMEOUT_MS must be a positive number.',
      );
    }
  }

  // ==========================================
  // FACE LIVENESS INTEGRATION
  // ==========================================

  async checkFaceLiveness(input: VerifyFaceLivenessInput) {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid request body.');
    }

    if (!input.inputImage) {
      throw new BadRequestException('Input image is required for Face Liveness verification.');
    }

    const rawCustId = String(input.customerId || '').trim();
    if (!rawCustId || rawCustId === 'null' || rawCustId === 'undefined' || !/^\d+$/.test(rawCustId)) {
      throw new BadRequestException('Valid customerId is required for Face Liveness verification.');
    }
    const customerId = BigInt(rawCustId);

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        customerCode: true,
        accountStatus: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    if (customer.accountStatus === 'BLOCKED') {
      throw new BadRequestException('Customer account is blocked.');
    }

    const rawAppId = String(input.applicationId || '').trim();
    const isValidAppId = rawAppId !== '' && rawAppId !== 'null' && rawAppId !== 'undefined' && /^\d+$/.test(rawAppId);
    const hintedApplicationId = isValidAppId ? BigInt(rawAppId) : null;

    let application = hintedApplicationId
      ? await this.prisma.plApplication.findFirst({ where: { id: hintedApplicationId, customerId } })
      : await this.prisma.plApplication.findFirst({ where: { customerId }, orderBy: { id: 'desc' } });

    if (!application) {
      const datePart = new Date().toISOString().slice(2, 10).replaceAll('-', '');
      const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
      const applicationNumber = `APP-${datePart}-${randomPart}`;

      application = await this.prisma.plApplication.create({
        data: {
          customerId,
          applicationNumber,
          status: 'DRAFT',
        },
      });
      this.logger.log(`Auto-created DRAFT application ${applicationNumber} for customer ${customerId} during face liveness check.`);
    }

    const clientRefNum = input.clientRefNum || `LIVENESS_${customerId}_${Date.now()}`.slice(0, 45);

    let base64Image = String(input.inputImage || '').trim();
    if (base64Image.includes(',')) {
      base64Image = base64Image.split(',')[1];
    }

    const requestPayload = {
      input_image: base64Image,
      client_ref_num: clientRefNum,
      ...(input.allowDeepfake ? { allow_deepfake: input.allowDeepfake } : {}),
    };

    try {
      const response: AxiosResponse<DigitapFaceLivenessResponse> =
        await firstValueFrom(
          this.httpService.post<DigitapFaceLivenessResponse>(
            this.faceLivenessApiUrl,
            requestPayload,
            {
              timeout: this.faceLivenessTimeoutMs,
              headers: {
                'Content-Type': 'application/json',
                authorization: this.faceLivenessAuthHeader,
              },
            },
          ),
        );

      const providerData = response.data;

      if (providerData?.status !== 'success' || !providerData.result) {
        throw new BadGatewayException({
          success: false,
          message: providerData?.message || 'Face liveness provider returned an unsuccessful response.',
        });
      }

      this.logger.log(
        `Face liveness verification completed for customer ${customer.customerCode}. Result is_live: ${providerData.result.is_live}`,
      );

      const isVerified = providerData.result.is_live === true;
      const liveness = await this.prisma.applicationLiveness.upsert({
        where: { applicationId: application.id },
        create: {
          applicationId: application.id,
          provider: 'DIGITAP',
          providerTransactionId: providerData.req_id,
          verificationStatus: isVerified ? 'VERIFIED' : 'FAILED',
          score: providerData.result.liveness_confidence,
          verifiedAt: isVerified ? new Date() : null,
          evidenceReference: providerData.client_ref_num,
        },
        update: {
          photoDocumentId: null,
          provider: 'DIGITAP',
          providerTransactionId: providerData.req_id,
          verificationStatus: isVerified ? 'VERIFIED' : 'FAILED',
          score: providerData.result.liveness_confidence,
          verifiedAt: isVerified ? new Date() : null,
          evidenceReference: providerData.client_ref_num,
        },
      });

      return {
        success: true,
        message: 'Face liveness check processed successfully.',
        data: {
          customerId: customer.id.toString(),
          customerCode: customer.customerCode,
          reqId: providerData.req_id,
          livenessVerificationId: liveness.id,
          clientRefNum: providerData.client_ref_num,
          livenessResult: providerData.result,
        },
      };
    } catch (error: unknown) {
      this.handleFaceLivenessApiError(error);
    }
  }

  private handleFaceLivenessApiError(error: unknown): never {
    if (
      error instanceof BadRequestException ||
      error instanceof BadGatewayException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }

    if (!(error instanceof AxiosError)) {
      this.logger.error(
        'Unexpected Face Liveness verification error.',
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException({
        success: false,
        message: 'An unexpected error occurred during Face Liveness verification.',
      });
    }

    const statusCode = error.response?.status;
    const providerMessage = error.response?.data?.message || 'Unknown provider error';

    this.logger.error(
      `Face Liveness provider request failed. Status: ${
        statusCode || 'NO_RESPONSE'
      }. Message: ${providerMessage}`,
    );

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new GatewayTimeoutException({
        success: false,
        message: 'Face Liveness provider did not respond in time.',
      });
    }

    if (!error.response) {
      throw new ServiceUnavailableException({
        success: false,
        message: 'Face Liveness service is currently unavailable.',
      });
    }

    if (statusCode === 400 || statusCode === 415 || statusCode === 413) {
      throw new BadRequestException({
        success: false,
        message: providerMessage || 'Invalid request sent to Face Liveness provider.',
      });
    }

    if (statusCode === 401) {
      throw new BadGatewayException({
        success: false,
        message: 'Face Liveness provider authentication failed.',
      });
    }

    if (statusCode && statusCode >= 500) {
      throw new BadGatewayException({
        success: false,
        message: 'Face Liveness provider is temporarily unavailable.',
      });
    }

    throw new BadGatewayException({
      success: false,
      message: providerMessage || 'Unable to complete Face Liveness check at this time.',
    });
  }

  // ==========================================
  // EXISTING PAN VERIFICATION METHODS
  // ==========================================

  async verifyPan(input: any) {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid request body.');
    }

    const customerId = this.parseCustomerId(
      String(input.customerId || ''),
    );

    const normalizedPan = String(
      input.panNumber || input.pan_number || input.id_number || '',
    )
      .trim()
      .toUpperCase();

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedPan)) {
      throw new BadRequestException('Enter a valid PAN number.');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        customerCode: true,
        mobileVerified: true,
        accountStatus: true,
        panNumber: true,
        panVerified: true,
        fullName: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    if (!customer.mobileVerified) {
      throw new BadRequestException(
        'Customer mobile number must be verified before PAN verification.',
      );
    }

    if (customer.accountStatus === 'BLOCKED') {
      throw new BadRequestException('Customer account is blocked.');
    }

    if (customer.panVerified && customer.panNumber === normalizedPan) {
      const existingKyc =
        await this.prisma.kycVerificationStatus.findFirst({
          where: { customerId },
        });

      return {
        success: true,
        message: 'PAN is already verified.',
        data: {
          customerId: customer.id.toString(),
          customerCode: customer.customerCode,
          panNumber: customer.panNumber,
          panVerified: customer.panVerified,
          kycStatus: existingKyc?.panStatus || KycStatus.VERIFIED,
          alreadyVerified: true,
        },
      };
    }

    const anotherCustomer = await this.prisma.customer.findFirst({
      where: {
        panNumber: normalizedPan,
        NOT: { id: customerId },
      },
      select: {
        id: true,
        customerCode: true,
      },
    });

    if (anotherCustomer) {
      throw new ConflictException(
        'This PAN number is already linked to another customer.',
      );
    }

    const isV5 =
      this.panApiUrl.toLowerCase().includes('pandetailed') ||
      this.panApiUrl.toLowerCase().includes('/v5') ||
      this.panApiUrl.toLowerCase().includes('v5');

    const requestPayload = isV5
      ? { id_number: normalizedPan }
      : {
          panNumber: normalizedPan,
          pan_number: normalizedPan,
          id_number: normalizedPan,
        };

    await this.markPanInitiated(customerId, requestPayload);

    // Track state across providers
    let finanalyzSuccess = false;
    let finanalyzData: FinanalyzPanResponse | null = null;
    let finanalyzError: any = null;
    let customerNameForZoop = String(
      input.fullName || input.panHolderName || customer.fullName || '',
    ).trim();

    // ──────────────────────────────────────────
    // 1️⃣ PRIMARY PROVIDER: Finanalyz
    // ──────────────────────────────────────────
    try {
      this.logger.log(
        `Attempting PAN verification via Finanalyz for customer ${customer.customerCode}...`,
      );

      const response: AxiosResponse<FinanalyzPanResponse> =
        await firstValueFrom(
          this.httpService.post<FinanalyzPanResponse>(
            this.panApiUrl,
            requestPayload,
            {
              timeout: this.panApiTimeoutMs,
              headers: {
                accept: '*/*',
                'Content-Type': 'application/json',
                XApiKey: this.panApiKey,
                'X-API-Key': this.panApiKey,
              },
            },
          ),
        );

      finanalyzData = response.data;

      // Unwrap nested response envelopes:
      // Finanalyz V5 can return:
      // {
      //   message: "Request processed successfully",
      //   data: {
      //     data: {
      //       client_id: "...",
      //       pan_number: "...",
      //       pan_details: { full_name: "...", status: "valid", ... }
      //     },
      //     status_code: 200,
      //     success: true,
      //     message: "Success",
      //     message_code: "success"
      //   }
      // }
      const rootPayload = response.data;
      const l1Payload = (rootPayload as any)?.data || rootPayload;
      const l2Payload = (l1Payload as any)?.data || l1Payload;

      const v5Details =
        l2Payload?.pan_details ||
        l1Payload?.pan_details ||
        (rootPayload as any)?.pan_details;

      const providerResponse =
        l2Payload?.response ||
        l1Payload?.response ||
        (rootPayload as any)?.response;

      const providerStatus =
        l2Payload?.status ||
        l1Payload?.status ||
        (rootPayload as any)?.status;

      // Extract customer name returned by Finanalyz (supports V5 full_name and legacy name)
      const nameFromFinanalyz = (
        v5Details?.full_name ||
        providerResponse?.name ||
        providerResponse?.firstName ||
        (rootPayload as any)?.name ||
        (l1Payload as any)?.name ||
        (l2Payload as any)?.name ||
        ''
      ).trim();

      if (nameFromFinanalyz) {
        customerNameForZoop = nameFromFinanalyz;
      }

      const isHttpOk = response.status === 200;

      // V5 Success check: checks across all wrapper layers
      const isV5Success =
        Boolean(v5Details?.full_name) &&
        (
          (rootPayload as any)?.success === true ||
          (l1Payload as any)?.success === true ||
          (l2Payload as any)?.success === true ||
          (rootPayload as any)?.status_code === 200 ||
          (l1Payload as any)?.status_code === 200 ||
          (l2Payload as any)?.status_code === 200 ||
          (rootPayload as any)?.message_code === 'success' ||
          (l1Payload as any)?.message_code === 'success' ||
          (rootPayload as any)?.message === 'Request processed successfully' ||
          (v5Details?.status && String(v5Details.status).toLowerCase() === 'valid')
        );

      // Legacy Success check
      const isLegacySuccess =
        providerResponse?.isValid === true &&
        (!providerStatus?.statusCode || providerStatus.statusCode === 200) &&
        (!providerResponse?.code || providerResponse.code === 200);

      const isPanValid = isV5Success || isLegacySuccess;
      const hasName = Boolean(nameFromFinanalyz);

      if (isHttpOk && isPanValid && hasName) {
        finanalyzSuccess = true;
      } else {
        const failureReason = !isPanValid
          ? 'PAN returned invalid or unverified status'
          : !hasName
            ? 'Customer name not returned by Finanalyz'
            : (rootPayload as any)?.message ||
              (l1Payload as any)?.message ||
              providerStatus?.statusMessage ||
              `Finanalyz response code: ${providerResponse?.code}`;
        this.logger.warn(
          `Finanalyz PAN verification was not successful (${failureReason}). Falling back to ZOOP...`,
        );
      }
    } catch (error: any) {
      finanalyzError = error;
      this.logger.warn(
        `Finanalyz PAN API request error (${error?.message || error}). Falling back to ZOOP...`,
      );

      // Check if error response contained customer name
      const errResponseData = error?.response?.data;
      const errName = (
        errResponseData?.data?.pan_details?.full_name ||
        errResponseData?.data?.response?.name ||
        errResponseData?.data?.response?.firstName ||
        errResponseData?.name ||
        ''
      ).trim();
      if (errName) {
        customerNameForZoop = errName;
      }
    }

    // If Finanalyz succeeded, save and return
    if (finanalyzSuccess && finanalyzData) {
      const normalizedData = this.normalizePanResponse(
        normalizedPan,
        finanalyzData,
      );

      const updatedCustomer = await this.saveVerifiedPan({
        customerId,
        normalizedData,
        rawRequest: requestPayload,
        rawResponse: finanalyzData,
      });

      this.logger.log(
        `PAN verification completed via FINANALYZ for customer ${updatedCustomer.customerCode}, PAN ending ${normalizedPan.slice(-4)}.`,
      );

      return {
        success: true,
        message: 'PAN verified and customer details saved successfully.',
        provider: 'FINANALYZ',
        data: {
          customerId: updatedCustomer.id.toString(),
          customerCode: updatedCustomer.customerCode,
          panNumber: updatedCustomer.panNumber,
          panVerified: updatedCustomer.panVerified,
          onboardingStatus: updatedCustomer.onboardingStatus,
          kycStatus: KycStatus.VERIFIED,
          verification: normalizedData,
        },
      };
    }

    // ──────────────────────────────────────────
    // 2️⃣ FALLBACK PROVIDER: ZOOP
    // ──────────────────────────────────────────
    this.logger.log(
      `Finanalyz failed. Triggering fallback PAN verification via ZOOP for PAN ${normalizedPan}...`,
    );

    // If customer name is still empty, check OCR log from previous PAN card photo scan
    if (!customerNameForZoop) {
      try {
        const ocrLog = await this.prisma.kycVerificationStatus.findFirst({
          where: { customerId },
          select: { panApiResponse: true },
        });
        if (ocrLog?.panApiResponse) {
          const parsed = JSON.parse(ocrLog.panApiResponse);
          const ocrName =
            parsed?.data?.name || parsed?.data?.fullName || parsed?.name;
          if (ocrName) customerNameForZoop = String(ocrName).trim();
        }
      } catch {
        // non-blocking
      }
    }

    if (!customerNameForZoop) {
      this.logger.error(
        `Cannot execute Zoop fallback for customer ${customerId}: No customer name found (neither in Finanalyz, form input, customer record, nor OCR).`,
      );

      await this.markPanFailed(
        customerId,
        requestPayload,
        finanalyzData || this.getSafeErrorForStorage(finanalyzError),
      );

      if (finanalyzError) {
        this.handlePanApiError(finanalyzError);
      }

      throw new BadRequestException({
        success: false,
        message:
          'Customer name is required for fallback PAN verification.',
      });
    }

    const zoopResult = await this.callZoopPan(
      normalizedPan,
      customerNameForZoop,
    );

    if (zoopResult.success && zoopResult.raw) {
      const normalizedData = this.normalizeZoopPanResponse(
        normalizedPan,
        zoopResult.raw,
        customerNameForZoop,
      );

      const updatedCustomer = await this.saveVerifiedPan({
        customerId,
        normalizedData,
        rawRequest: zoopResult.requestPayload,
        rawResponse: zoopResult.raw,
      });

      this.logger.log(
        `PAN verification completed via ZOOP (fallback) for customer ${updatedCustomer.customerCode}, PAN ending ${normalizedPan.slice(-4)}.`,
      );

      return {
        success: true,
        message: 'PAN verified successfully via fallback provider.',
        provider: 'ZOOP',
        data: {
          customerId: updatedCustomer.id.toString(),
          customerCode: updatedCustomer.customerCode,
          panNumber: updatedCustomer.panNumber,
          panVerified: updatedCustomer.panVerified,
          onboardingStatus: updatedCustomer.onboardingStatus,
          kycStatus: KycStatus.VERIFIED,
          verification: normalizedData,
        },
      };
    }

    // Both Finanalyz and Zoop failed
    const zoopErrorMsg =
      zoopResult?.raw?.response_message ||
      zoopResult?.raw?.message ||
      (typeof zoopResult?.error === 'string' ? zoopResult.error : null) ||
      'PAN verification could not be completed via primary or fallback provider.';

    await this.markPanFailed(customerId, zoopResult.requestPayload || requestPayload, {
      finanalyz: finanalyzData || this.getSafeErrorForStorage(finanalyzError),
      zoop: zoopResult.raw || zoopResult.error,
    });

    throw new BadRequestException({
      success: false,
      message: zoopErrorMsg,
      provider: 'ZOOP',
    });
  }

  private async saveVerifiedPan(input: {
    customerId: bigint;
    normalizedData: NormalizedPanVerificationData;
    rawRequest: unknown;
    rawResponse: unknown;
  }) {
    const now = new Date();

    const dateOfBirth = input.normalizedData.dateOfBirth
      ? this.parseIsoDate(input.normalizedData.dateOfBirth)
      : null;

    const gender = this.toCustomerGender(input.normalizedData.gender);

    return this.prisma.$transaction(async (transaction) => {
      const updatedCustomer = await transaction.customer.update({
        where: { id: input.customerId },
        data: {
          panNumber: input.normalizedData.panNumber,
          panVerified: true,
          panVerifiedAt: now,
          panProviderApplicationId: input.normalizedData.providerApplicationId,
          panHolderType: input.normalizedData.typeOfHolder,
          fullName: input.normalizedData.fullName,
          firstName: input.normalizedData.firstName,
          middleName: input.normalizedData.middleName,
          lastName: input.normalizedData.lastName,
          ...(input.normalizedData.fatherName || (input.rawResponse as any)?.data?.father_name
            ? { fatherName: input.normalizedData.fatherName || (input.rawResponse as any)?.data?.father_name }
            : {}),
          dateOfBirth,
          gender,
          residentialPincode: this.isValidPincode(input.normalizedData.pincode)
            ? input.normalizedData.pincode
            : undefined,
          onboardingStatus: CustomerOnboardingStatus.PAN_VERIFIED,
          lastActivityAt: now,
        },
      });

      const existingKyc = await transaction.kycVerificationStatus.findFirst({
        where: { customerId: input.customerId },
        select: { id: true },
      });

      const kycData = {
        panStatus: KycStatus.VERIFIED,
        firstName: input.normalizedData.firstName,
        middleName: input.normalizedData.middleName,
        lastName: input.normalizedData.lastName,
        panApiRequest: this.stringifyJson(input.rawRequest),
        panApiResponse: this.stringifyJson(input.rawResponse),
      };

      if (existingKyc) {
        await transaction.kycVerificationStatus.update({
          where: { id: existingKyc.id },
          data: kycData,
        });
      } else {
        await transaction.kycVerificationStatus.create({
          data: {
            customerId: input.customerId,
            ...kycData,
            mobileStatus: KycStatus.VERIFIED,
          },
        });
      }

      return updatedCustomer;
    });
  }

  private async markPanInitiated(customerId: bigint, rawRequest: unknown): Promise<void> {
    const existingKyc = await this.prisma.kycVerificationStatus.findFirst({
      where: { customerId },
      select: { id: true },
    });

    const data = {
      panStatus: KycStatus.INITIATED,
      panApiRequest: this.stringifyJson(rawRequest),
      panApiResponse: null,
    };

    if (existingKyc) {
      await this.prisma.kycVerificationStatus.update({
        where: { id: existingKyc.id },
        data,
      });
      return;
    }

    await this.prisma.kycVerificationStatus.create({
      data: {
        customerId,
        ...data,
        mobileStatus: KycStatus.VERIFIED,
      },
    });
  }

  private async markPanFailed(customerId: bigint, rawRequest: unknown, rawResponse: unknown): Promise<void> {
    try {
      const existingKyc = await this.prisma.kycVerificationStatus.findFirst({
        where: { customerId },
        select: { id: true },
      });

      const data = {
        panStatus: KycStatus.FAILED,
        panApiRequest: this.stringifyJson(rawRequest),
        panApiResponse: this.stringifyJson(rawResponse),
      };

      if (existingKyc) {
        await this.prisma.kycVerificationStatus.update({
          where: { id: existingKyc.id },
          data,
        });
        return;
      }

      await this.prisma.kycVerificationStatus.create({
        data: {
          customerId,
          ...data,
          mobileStatus: KycStatus.VERIFIED,
        },
      });
    } catch (databaseError) {
      this.logger.error(
        'Unable to store failed PAN verification status.',
        databaseError instanceof Error ? databaseError.stack : undefined,
      );
    }
  }

  private normalizePanResponse(requestedPan: string, response: any): NormalizedPanVerificationData {
    const root = response;
    const l1 = root?.data || root;
    const l2 = l1?.data || l1;

    const v5Details =
      l2?.pan_details ||
      l1?.pan_details ||
      root?.pan_details;

    const panDetails =
      l2?.response ||
      l1?.response ||
      root?.response;

    const status =
      l2?.status ||
      l1?.status ||
      root?.status;

    const providerData =
      l2?.client_id || l2?.pan_details ? l2 : (l1?.client_id || l1?.pan_details ? l1 : (root?.data || root));

    const fullName = this.cleanOptionalText(
      v5Details?.full_name || panDetails?.name,
    );

    let firstName: string | null = null;
    let middleName: string | null = null;
    let lastName: string | null = null;

    if (Array.isArray(v5Details?.full_name_split) && v5Details.full_name_split.length > 0) {
      firstName = this.cleanOptionalText(v5Details.full_name_split[0]);
      middleName = this.cleanOptionalText(v5Details.full_name_split[1]);
      lastName = this.cleanOptionalText(v5Details.full_name_split[2]);
    } else if (panDetails?.firstName) {
      firstName = this.cleanOptionalText(panDetails.firstName);
      middleName = this.cleanOptionalText(panDetails.middleName);
      lastName = this.cleanOptionalText(panDetails.lastName);
    } else if (fullName) {
      const split = this.splitFullName(fullName);
      firstName = split.firstName;
      middleName = split.middleName;
      lastName = split.lastName;
    }

    const fatherName = this.cleanOptionalText(
      v5Details?.father_name ||
      panDetails?.father_name ||
      panDetails?.fatherName ||
      (panDetails as any)?.careOf ||
      (panDetails as any)?.father ||
      (providerData as any)?.father_name ||
      (providerData as any)?.fatherName ||
      (response as any)?.data?.response?.father_name ||
      (response as any)?.data?.response?.fatherName,
    );

    const gender = this.mapGender(v5Details?.gender || panDetails?.gender);
    const dateOfBirth = this.convertDateToIso(v5Details?.dob || panDetails?.dob);

    const maskedAadhaar = this.cleanOptionalText(
      v5Details?.masked_aadhaar || panDetails?.maskedAadhaar,
    );

    const aadhaarLastFourDigits = this.extractAadhaarLastFourDigits(
      v5Details?.masked_aadhaar || panDetails?.lastFourDigit || panDetails?.maskedAadhaar,
    );

    const aadhaarSeedingStatus =
      v5Details?.aadhaar_linked !== undefined
        ? Boolean(v5Details.aadhaar_linked)
        : typeof panDetails?.aadhaarSeedingStatus === 'boolean'
          ? panDetails.aadhaarSeedingStatus
          : null;

    const typeOfHolder = this.cleanOptionalText(
      v5Details?.category || panDetails?.typeOfHolder || 'Individual',
    );

    const address = v5Details?.address
      ? (v5Details.address.full || this.formatAddressObject(v5Details.address))
      : this.cleanOptionalText(panDetails?.address);

    const city = this.cleanOptionalText(
      v5Details?.address?.city || panDetails?.city,
    );
    const state = this.cleanOptionalText(
      v5Details?.address?.state || panDetails?.state,
    );
    const country = this.cleanOptionalText(
      v5Details?.address?.country || panDetails?.country || 'India',
    );
    const pincode = this.cleanOptionalText(
      v5Details?.address?.zip || panDetails?.pincode,
    );

    const maskedMobile = this.cleanOptionalText(
      v5Details?.phone_number || panDetails?.mobile_no,
    );
    const maskedEmail = this.cleanOptionalText(
      v5Details?.email || panDetails?.email,
    );

    const providerStatusCode =
      root?.status_code ||
      l1?.status_code ||
      l2?.status_code ||
      (typeof status?.statusCode === 'number' ? status.statusCode : 200);

    const providerStatusMessage = this.cleanOptionalText(
      root?.message || l1?.message || l2?.message || status?.statusMessage || 'Success',
    );

    return {
      providerApplicationId: providerData?.client_id || providerData?.applicationId || null,
      panNumber: (providerData?.pan_number || panDetails?.pan || requestedPan).trim().toUpperCase(),
      isValid: true,
      fullName,
      firstName,
      middleName,
      lastName,
      fatherName,
      gender,
      dateOfBirth,
      maskedAadhaar,
      aadhaarLastFourDigits,
      aadhaarSeedingStatus,
      typeOfHolder,
      address,
      city,
      state,
      country,
      pincode,
      maskedMobile,
      maskedEmail,
      providerStatusCode,
      providerStatusMessage,
      providerTimestamp: new Date().toISOString(),
    };
  }

  private cleanOptionalText(value?: string): string | null {
    if (typeof value !== 'string') return null;
    const cleanedValue = value.trim().replace(/\s+/g, ' ');
    return cleanedValue || null;
  }

  private mapGender(gender?: string): 'MALE' | 'FEMALE' | 'OTHER' | null {
    const normalizedGender = gender?.trim().toUpperCase();
    if (normalizedGender === 'M' || normalizedGender === 'MALE') return 'MALE';
    if (normalizedGender === 'F' || normalizedGender === 'FEMALE') return 'FEMALE';
    if (normalizedGender === 'O' || normalizedGender === 'OTHER') return 'OTHER';
    return null;
  }

  private toCustomerGender(gender: 'MALE' | 'FEMALE' | 'OTHER' | null): CustomerGender | undefined {
    if (!gender) return undefined;
    return gender as CustomerGender;
  }

  private convertDateToIso(dateOfBirth?: string): string | null {
    if (!dateOfBirth) return null;
    const trimmed = dateOfBirth.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  /**
   * ZOOP Fallback PAN Verification Provider
   */
  async callZoopPan(panNumber: string, panHolderName: string) {
    if (!this.zoopPanApiUrl || !this.zoopApiKey || !this.zoopAppId) {
      this.logger.error('ZOOP PAN configuration is missing in environment variables.');
      return {
        success: false,
        error: 'ZOOP PAN verification configuration is missing.',
        raw: null,
        result: null,
        taskId: null,
        requestPayload: null,
      };
    }

    const taskId = randomUUID();
    const payload = {
      mode: 'sync',
      data: {
        customer_pan_number: panNumber.toUpperCase(),
        pan_holder_name: panHolderName.toUpperCase(),
        consent: 'Y',
        consent_text:
          'I hereby declare my consent agreement for fetching my information via ZOOP API',
      },
      task_id: taskId,
    };

    try {
      this.logger.log(
        `[ZOOP PAN API] Calling Zoop PAN endpoint for ${panNumber} with name "${panHolderName}" [Task ID: ${taskId}]...`,
      );

      const response = await firstValueFrom(
        this.httpService.post(this.zoopPanApiUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.zoopApiKey,
            'app-id': this.zoopAppId,
            app_id: this.zoopAppId,
          },
          timeout: 30000,
        }),
      );

      const raw = response.data;
      const httpOk = response.status === 200;
      const apiSuccess =
        raw?.success === true ||
        raw?.status === 'success' ||
        raw?.data?.result === 'success' ||
        raw?.response_code === '100';

      const result = raw?.result || raw?.data?.result || raw?.data || {};

      const isVerified =
        result?.extra_fields?.is_pan_verified === 'yes' ||
        result?.isValid === true ||
        (httpOk && apiSuccess && Boolean(result?.user_full_name || result?.name || result?.pan_number));

      this.logger.log(
        `[ZOOP PAN API] Response received. httpOk: ${httpOk}, apiSuccess: ${apiSuccess}, isVerified: ${isVerified}`,
      );

      return {
        success: Boolean(httpOk && apiSuccess && isVerified),
        raw,
        result,
        taskId,
        requestPayload: payload,
      };
    } catch (error: any) {
      this.logger.error(
        `[ZOOP PAN API] Request failed: ${error?.response?.data ? JSON.stringify(error.response.data) : error?.message || error}`,
      );

      return {
        success: false,
        error: error?.response?.data || error?.message || 'Zoop PAN request failed',
        raw: error?.response?.data || null,
        result: null,
        taskId,
        requestPayload: payload,
      };
    }
  }

  private normalizeZoopPanResponse(
    requestedPan: string,
    zoopData: any,
    fallbackName: string,
  ): NormalizedPanVerificationData {
    const result =
      zoopData?.result || zoopData?.data?.result || zoopData?.data || {};

    const fullName =
      this.cleanOptionalText(result?.user_full_name) ||
      this.cleanOptionalText(result?.name) ||
      this.cleanOptionalText(result?.pan_holder_name) ||
      fallbackName;

    const nameParts = this.splitFullName(fullName);

    const fatherName = this.cleanOptionalText(
      result?.father_name || result?.fatherName,
    );

    const gender = this.mapGender(result?.gender);

    const dateOfBirth = this.convertDateToIso(
      result?.dob || result?.date_of_birth,
    );

    const addressStr =
      typeof result?.address === 'object'
        ? this.formatAddressObject(result.address)
        : this.cleanOptionalText(result?.address);

    const city = this.cleanOptionalText(
      result?.address?.city || result?.city,
    );
    const state = this.cleanOptionalText(
      result?.address?.state || result?.state,
    );
    const pincode = this.cleanOptionalText(
      result?.address?.pincode || result?.pincode,
    );

    const maskedAadhaar = this.cleanOptionalText(
      result?.masked_aadhaar || result?.aadhaar_number,
    );

    const aadhaarLastFourDigits = this.extractAadhaarLastFourDigits(
      result?.masked_aadhaar ||
        result?.aadhaar_number ||
        result?.last_four_digit,
    );

    const aadhaarSeedingStatus =
      result?.extra_fields?.aadhaar_seeding_status === 'OPERATIVE' ||
      result?.extra_fields?.aadhaar_seeding_status === true ||
      result?.aadhaar_seeding_status === 'OPERATIVE' ||
      result?.aadhaar_seeding_status === true;

    return {
      providerApplicationId: zoopData?.task_id || zoopData?.id || null,
      panNumber: (result?.pan_number || result?.pan || requestedPan)
        .trim()
        .toUpperCase(),
      isValid: true,
      fullName,
      firstName:
        this.cleanOptionalText(result?.first_name) || nameParts.firstName,
      middleName:
        this.cleanOptionalText(result?.middle_name) || nameParts.middleName,
      lastName:
        this.cleanOptionalText(result?.last_name) || nameParts.lastName,
      fatherName,
      gender,
      dateOfBirth,
      maskedAadhaar,
      aadhaarLastFourDigits,
      aadhaarSeedingStatus: aadhaarSeedingStatus ? true : null,
      typeOfHolder:
        this.cleanOptionalText(result?.type_of_holder) || 'Individual',
      address: addressStr,
      city,
      state,
      country: this.cleanOptionalText(result?.address?.country) || 'India',
      pincode,
      maskedMobile: this.cleanOptionalText(result?.mobile_no),
      maskedEmail: this.cleanOptionalText(result?.email),
      providerStatusCode:
        typeof zoopData?.response_code === 'string'
          ? parseInt(zoopData.response_code, 10)
          : 200,
      providerStatusMessage: this.cleanOptionalText(
        zoopData?.response_message || 'SUCCESS',
      ),
      providerTimestamp: new Date().toISOString(),
    };
  }

  private splitFullName(fullName: string | null): {
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
  } {
    if (!fullName) return { firstName: null, middleName: null, lastName: null };
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], middleName: null, lastName: null };
    if (parts.length === 2) return { firstName: parts[0], middleName: null, lastName: parts[1] };
    return {
      firstName: parts[0],
      middleName: parts.slice(1, -1).join(' '),
      lastName: parts[parts.length - 1],
    };
  }

  private formatAddressObject(addr: any): string | null {
    if (!addr || typeof addr !== 'object') return null;
    const parts = [
      addr.building_name,
      addr.street_name,
      addr.locality,
      addr.city,
      addr.state,
      addr.pincode,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  }

  private parseIsoDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Invalid PAN date of birth.');
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid PAN date of birth.');
    }
    return date;
  }

  private extractAadhaarLastFourDigits(value?: string): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : null;
  }

  private isValidPincode(value: string | null): boolean {
    return typeof value === 'string' && /^[1-9][0-9]{5}$/.test(value);
  }

  private parseCustomerId(value: string): bigint {
    if (!/^[1-9][0-9]*$/.test(value)) {
      throw new BadRequestException('A valid customer ID is required.');
    }
    return BigInt(value);
  }

  private stringifyJson(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return JSON.stringify({ message: 'Unable to serialize response.' });
    }
  }

  private getSafeErrorForStorage(error: unknown) {
    if (error instanceof AxiosError) {
      return {
        message: error.message,
        code: error.code || null,
        status: error.response?.status || null,
        response: error.response?.data || null,
      };
    }
    if (error instanceof Error) {
      return { message: error.message };
    }
    return { message: String(error) };
  }

  private handlePanApiError(error: unknown): never {
    if (
      error instanceof BadRequestException ||
      error instanceof BadGatewayException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }

    if (!(error instanceof AxiosError)) {
      this.logger.error(
        'Unexpected PAN verification error.',
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException({
        success: false,
        message: 'An unexpected error occurred during PAN verification.',
      });
    }

    const statusCode = error.response?.status;
    const providerMessage = this.extractProviderErrorMessage(error.response?.data);

    this.logger.error(
      `PAN provider request failed. Status: ${statusCode || 'NO_RESPONSE'}. Message: ${providerMessage}`,
    );

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new GatewayTimeoutException({
        success: false,
        message: 'PAN verification provider did not respond in time.',
      });
    }

    if (!error.response) {
      throw new ServiceUnavailableException({
        success: false,
        message: 'PAN verification service is currently unavailable.',
      });
    }

    if (statusCode === 400 || statusCode === 422) {
      throw new BadRequestException({
        success: false,
        message: providerMessage || 'PAN verification request was rejected.',
      });
    }

    if (statusCode === 401 || statusCode === 403) {
      throw new BadGatewayException({
        success: false,
        message: 'PAN verification provider authentication failed.',
      });
    }

    if (statusCode && statusCode >= 500) {
      throw new BadGatewayException({
        success: false,
        message: 'PAN verification provider is temporarily unavailable.',
      });
    }

    throw new BadGatewayException({
      success: false,
      message: providerMessage || 'Unable to verify PAN at this time.',
    });
  }

  private extractProviderErrorMessage(responseData: unknown): string {
    if (typeof responseData === 'string') return responseData;
    if (responseData && typeof responseData === 'object') {
      const data = responseData as Record<string, unknown>;
      if (typeof data.message === 'string') return data.message;
      if (typeof data.error === 'string') return data.error;
      if (data.error && typeof data.error === 'object') {
        const errObj = data.error as Record<string, unknown>;
        if (typeof errObj.message === 'string') return errObj.message;
      }
      if (typeof data.detail === 'string') return data.detail;
      if (Array.isArray(data.detail) && data.detail.length > 0) {
        const first = data.detail[0];
        if (typeof first === 'string') return first;
        if (first && typeof first === 'object' && typeof (first as any).msg === 'string') {
          return `${(first as any).loc ? (first as any).loc.join('.') + ': ' : ''}${(first as any).msg}`;
        }
      }
      if (data.status && typeof data.status === 'object') {
        const status = data.status as Record<string, unknown>;
        if (typeof status.statusMessage === 'string') {
          return status.statusMessage;
        }
      }
    }
    return 'Unknown provider error';
  }

  async reverseGeocode(input: { latitude: number; longitude: number }) {
    const lat = Number(input?.latitude);
    const lon = Number(input?.longitude);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException('Latitude must be a valid number between -90 and 90.');
    }

    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new BadRequestException('Longitude must be a valid number between -180 and 180.');
    }

    const apiUrl = process.env.GEOCODING_API_URL || 'https://nominatim.openstreetmap.org/reverse';

    try {
      const response = await firstValueFrom(
        this.httpService.get(apiUrl, {
          params: {
            format: 'json',
            lat,
            lon,
            zoom: 18,
            addressdetails: 1,
            ...(process.env.GEOCODING_API_KEY ? { key: process.env.GEOCODING_API_KEY } : {}),
          },
          headers: {
            'User-Agent': 'PersonalLoanPlatform/1.0',
            Accept: 'application/json',
          },
          timeout: Number(process.env.GEOCODING_TIMEOUT || 15000),
        }),
      );

      const addressData = response.data?.address || {};
      const displayName = response.data?.display_name || '';

      const city =
        addressData.city ||
        addressData.town ||
        addressData.village ||
        addressData.suburb ||
        addressData.county ||
        '';

      const state = addressData.state || '';
      const country = addressData.country || 'India';
      const postalCode = addressData.postcode || '';

      const formattedAddress = displayName || [city, state, country].filter(Boolean).join(', ');

      return {
        success: true,
        data: {
          formattedAddress,
          city,
          state,
          country,
          postalCode,
          latitude: lat,
          longitude: lon,
        },
      };
    } catch (error) {
      this.logger.warn(`Reverse geocoding API lookup failed for ${lat}, ${lon}. Using fallback format.`);

      return {
        success: true,
        data: {
          formattedAddress: `Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}`,
          city: '',
          state: '',
          country: 'India',
          postalCode: '',
          latitude: lat,
          longitude: lon,
        },
      };
    }
  }

  private async ensureBankVerificationTable() {
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`pl_bank_verifications\` (
          \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`loan_id\` BIGINT UNSIGNED NOT NULL,
          \`customer_id\` BIGINT UNSIGNED NOT NULL,
          \`application_id\` BIGINT UNSIGNED NOT NULL,
          \`lan\` VARCHAR(30) NOT NULL,
          \`account_holder_name\` VARCHAR(200) NOT NULL,
          \`account_type\` ENUM('SAVINGS', 'CURRENT') NOT NULL,
          \`account_number_encrypted\` TEXT NOT NULL,
          \`account_number_masked\` VARCHAR(30) NOT NULL,
          \`account_number_fingerprint\` CHAR(64) NOT NULL,
          \`ifsc_code\` VARCHAR(11) NOT NULL,
          \`bank_name\` VARCHAR(150) NULL,
          \`branch_name\` VARCHAR(150) NULL,
          \`provider\` VARCHAR(30) NOT NULL DEFAULT 'DIGIO',
          \`provider_reference\` VARCHAR(255) NULL,
          \`provider_verified\` TINYINT(1) NOT NULL DEFAULT 0,
          \`provider_beneficiary_name\` VARCHAR(200) NULL,
          \`provider_bank_name\` VARCHAR(150) NULL,
          \`provider_branch_name\` VARCHAR(150) NULL,
          \`fuzzy_match_score\` DECIMAL(5, 2) NULL,
          \`name_match_threshold\` DECIMAL(5, 2) NULL,
          \`name_matched\` TINYINT(1) NOT NULL DEFAULT 0,
          \`verification_amount\` DECIMAL(5, 2) NULL,
          \`status\` ENUM('INITIATED', 'VERIFIED', 'FAILED', 'NAME_MISMATCH', 'PROVIDER_ERROR') NOT NULL DEFAULT 'INITIATED',
          \`verified_at\` DATETIME(0) NULL,
          \`failure_code\` VARCHAR(100) NULL,
          \`failure_reason\` VARCHAR(500) NULL,
          \`raw_response\` LONGTEXT NULL,
          \`ip_address\` VARCHAR(45) NULL,
          \`user_agent\` VARCHAR(500) NULL,
          \`created_at\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_pl_bank_verification_loan_id\` (\`loan_id\`),
          UNIQUE KEY \`uk_pl_bank_verification_lan\` (\`lan\`),
          UNIQUE KEY \`uk_pl_bank_provider_ref\` (\`provider_reference\`),
          KEY \`idx_pl_bank_verification_customer\` (\`customer_id\`),
          KEY \`idx_pl_bank_verification_application\` (\`application_id\`),
          KEY \`idx_pl_bank_verification_status\` (\`status\`),
          KEY \`idx_pl_bank_verification_fingerprint\` (\`account_number_fingerprint\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    } catch (e: any) {
      this.logger.warn(`Auto table creation check warning: ${e?.message || e}`);
    }
  }

  async verifyCustomerBankAccount(
    lanInput: string,
    body: any,
    authenticatedUser: any,
    metadata?: any,
  ) {
    await this.ensureBankVerificationTable();

    const lan = String(lanInput || '').trim().toUpperCase();
    if (!lan) {
      throw new BadRequestException('LAN is required.');
    }

    const principalCustomerId = String(authenticatedUser?.customerId || '').trim();
    if (!/^[1-9][0-9]*$/.test(principalCustomerId)) {
      throw new NotFoundException('Loan not found or does not belong to this customer.');
    }
    const loan = await this.prisma.plLoan.findFirst({
      where: { lan, customerId: BigInt(principalCustomerId) },
      include: { customer: true, application: true, bankVerification: true },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found or does not belong to this customer.');
    }

    // Repeat-customer "keep same bank account" path: the customer never re-types their
    // account details, so substitute in the decrypted details from their most recent
    // verified bank account before falling through to the normal validation + Digio penny
    // drop below — this loan still gets its own genuine, fresh verification call and
    // PlBankVerification row, it just doesn't require the customer to retype anything.
    let effectiveBody = body;
    if (body?.reuseFromPreviousLoan === true) {
      const previous = await this.prisma.plBankVerification.findFirst({
        where: { customerId: BigInt(principalCustomerId), status: 'VERIFIED' },
        orderBy: { id: 'desc' },
      });
      if (!previous) {
        throw new BadRequestException('No previously verified bank account was found to reuse.');
      }
      const previousAccountNumber = decryptBankAccountNumber(previous.accountNumberEncrypted);
      effectiveBody = {
        accountHolderName: previous.accountHolderName,
        accountNumber: previousAccountNumber,
        confirmAccountNumber: previousAccountNumber,
        ifscCode: previous.ifscCode,
        bankName: previous.bankName,
        branchName: previous.branchName,
        accountType: previous.accountType,
      };
    }

    // Validate request payload
    const accountHolderName = String(effectiveBody?.accountHolderName || '').trim();
    const accountNumber = String(effectiveBody?.accountNumber || '').replace(/\D/g, '');
    const confirmAccountNumber = String(effectiveBody?.confirmAccountNumber || '').replace(/\D/g, '');
    const ifscCode = String(effectiveBody?.ifscCode || '').trim().toUpperCase();
    const bankName = String(effectiveBody?.bankName || '').trim();
    const branchName = String(effectiveBody?.branchName || '').trim();
    const rawAccountType = String(effectiveBody?.accountType || '').trim().toUpperCase();

    if (!accountHolderName || !/^[a-zA-Z][a-zA-Z .'-]{1,149}$/.test(accountHolderName)) {
      throw new BadRequestException('Please enter a valid account holder name.');
    }

    if (!accountNumber || accountNumber.length < 9 || accountNumber.length > 20) {
      throw new BadRequestException('Account number must contain 9 to 20 digits.');
    }

    if (!confirmAccountNumber) {
      throw new BadRequestException('Please confirm the bank account number.');
    }

    if (accountNumber !== confirmAccountNumber) {
      throw new BadRequestException('Account number and confirm account number do not match.');
    }

    if (!ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      throw new BadRequestException('Please enter a valid 11-character IFSC code.');
    }

    if (!bankName) {
      throw new BadRequestException('Please enter the bank name.');
    }

    if (!branchName) {
      throw new BadRequestException('Please enter the branch name.');
    }

    if (!['SAVINGS', 'CURRENT'].includes(rawAccountType)) {
      throw new BadRequestException('Account type must be SAVINGS or CURRENT.');
    }

    const accountType = rawAccountType as PlBankAccountType;

    // Security helpers
    const accountNumberEncrypted = encryptBankAccountNumber(accountNumber);
    const accountNumberFingerprint = createBankAccountFingerprint(accountNumber);
    const accountNumberMasked = maskBankAccountNumber(accountNumber);

    // Call Digio Penny Drop API
    const customerFullName = loan.customer?.fullName || accountHolderName;
    const digioRes = await this.digioBankService.verifyBankAccount({
      accountNo: accountNumber,
      ifsc: ifscCode,
      name: accountHolderName,
      customerName: customerFullName,
    });

    // Compute Name Matching Score
    let fuzzyMatchScore = digioRes.fuzzyMatchScore ?? 0;
    const fuzzyMatchSource = digioRes.fuzzyMatchSource ?? 'NONE';
    const fuzzyMatchReason = digioRes.fuzzyMatchReason ?? 'NO_MATCH';

    const nameMatchThreshold = Number(this.configService.get('DIGIO_BANK_NAME_MATCH_THRESHOLD') || '85');
    const nameMatched = Boolean(digioRes.verified && (fuzzyMatchScore >= nameMatchThreshold));

    let status: PlBankVerificationStatus;
    let failureCode: string | null = null;
    let failureReason: string | null = null;

    if (digioRes.verified) {
      if (nameMatched) {
        status = PlBankVerificationStatus.VERIFIED;
      } else {
        status = PlBankVerificationStatus.NAME_MISMATCH;
        failureCode = 'NAME_MISMATCH';
        failureReason = 'Bank account holder name does not match customer name';
      }
    } else {
      status = PlBankVerificationStatus.FAILED;
      failureCode = 'BANK_VERIFICATION_FAILED';
      failureReason = digioRes.rawResponse?.message || 'Bank verification failed with provider';
    }

    const providerVerified = digioRes.verified;
    const providerBeneficiaryName = digioRes.beneficiaryNameWithBank;
    const providerBankName = digioRes.bankName;
    const providerBranchName = digioRes.branchName;
    const providerReference = digioRes.providerReference;
    const verifiedAt = digioRes.verifiedAt;
    const rawResponseStr = JSON.stringify(digioRes.rawResponse || {});

    const ipAddress = metadata?.ipAddress || null;
    const userAgent = metadata?.userAgent || null;

    // Execute Prisma Transaction
    const bankVerification = await this.prisma.$transaction(async (tx) => {
      const record = await tx.plBankVerification.upsert({
        where: { loanId: loan.id },
        create: {
          loanId: loan.id,
          customerId: loan.customerId,
          applicationId: loan.applicationId,
          lan: loan.lan,

          accountHolderName,
          accountType,

          accountNumberEncrypted,
          accountNumberMasked,
          accountNumberFingerprint,

          ifscCode,
          bankName,
          branchName,

          provider: 'DIGIO',
          providerReference,

          providerVerified,
          providerBeneficiaryName,
          providerBankName,
          providerBranchName,

          fuzzyMatchScore,
          nameMatchThreshold,
          nameMatched,

          verificationAmount: 1.00,
          status,
          verifiedAt,

          failureCode,
          failureReason,

          rawResponse: rawResponseStr,
          ipAddress,
          userAgent,
        },
        update: {
          accountHolderName,
          accountType,

          accountNumberEncrypted,
          accountNumberMasked,
          accountNumberFingerprint,

          ifscCode,
          bankName,
          branchName,

          providerReference,

          providerVerified,
          providerBeneficiaryName,
          providerBankName,
          providerBranchName,

          fuzzyMatchScore,
          nameMatchThreshold,
          nameMatched,

          verificationAmount: 1.00,
          status,
          verifiedAt,

          failureCode,
          failureReason,

          rawResponse: rawResponseStr,
          ipAddress,
          userAgent,
          updatedAt: new Date(),
        },
      });

      if (status === PlBankVerificationStatus.VERIFIED) {
        await tx.plLoan.update({
          where: { id: loan.id },
          data: {
            bankVerified: true,
            bankAccountHolderName: providerBeneficiaryName || accountHolderName,
            bankAccountType: accountType,
            bankAccountMasked: accountNumberMasked,
            bankIfsc: ifscCode,
            bankName: providerBankName || bankName,
            bankProviderReference: providerReference,
            bankNameMatchScore: fuzzyMatchScore,
            bankVerifiedAt: verifiedAt || new Date(),
            status: PlLoanStatus.KYC_IN_PROGRESS,
            currentStep: 'KFS_ACCEPTANCE',
          },
        });
      } else if (status === PlBankVerificationStatus.NAME_MISMATCH) {
        const decidedAt = new Date();
        const rejectReason = `Bank verification rejected: Bank account holder name does not match customer name (Fuzzy match score: ${fuzzyMatchScore}, threshold: ${nameMatchThreshold})`;

        if (loan.applicationId) {
          await tx.plApplication.update({
            where: { id: loan.applicationId },
            data: {
              status: 'LENDER_REJECTED',
              lenderDecisionReason: rejectReason,
              lenderDecisionAt: decidedAt,
            },
          });
        }

        if (loan.customerId) {
          await tx.customer.update({
            where: { id: loan.customerId },
            data: {
              onboardingStatus: 'LENDER_REJECTED',
              lastActivityAt: decidedAt,
            },
          });
        }

        await tx.plLoan.update({
          where: { id: loan.id },
          data: {
            bankVerified: false,
            currentStep: 'BANK_VERIFICATION',
            status: PlLoanStatus.CANCELLED,
          },
        });
      } else {
        await tx.plLoan.update({
          where: { id: loan.id },
          data: {
            bankVerified: false,
            currentStep: 'BANK_VERIFICATION',
          },
        });
      }

      // Direct Aadhaar-vs-bank name check, alongside the existing PAN-anchored one
      // above (which compares against loan.customer.fullName — the PAN-verified name).
      // Not a new blocking gate: the PAN-anchored check already blocks on mismatch, and
      // this is the first time these two are compared directly rather than only via
      // PAN as an intermediary. Local matcher, no third-party call — see
      // checkPanAadhaarNameConsistency in customer-aadhaar-kyc.service.ts for the same
      // reasoning applied to PAN vs Aadhaar.
      const aadhaarBankMatch = loan.aadhaarVerifiedName && providerBeneficiaryName
        ? namesLikelyMatch(loan.aadhaarVerifiedName, providerBeneficiaryName)
        : null;

      await tx.plLoanAuditEvent.create({
        data: {
          loanId: loan.id,
          lan: loan.lan,
          customerId: loan.customerId,
          applicationId: loan.applicationId,

          eventType:
            status === PlBankVerificationStatus.VERIFIED
              ? 'BANK_VERIFIED'
              : status === PlBankVerificationStatus.NAME_MISMATCH
              ? 'BANK_NAME_MISMATCH'
              : 'BANK_VERIFICATION_FAILED',

          metadata: {
            provider: 'DIGIO',
            providerReference,
            maskedAccountNumber: accountNumberMasked,
            ifsc: maskIfscForAudit(ifscCode),
            fuzzyMatchScore,
            fuzzyMatchSource,
            fuzzyMatchReason,
            nameMatchThreshold,
            status,
            nameMatched,
            failureReason: failureReason || null,
            ...(aadhaarBankMatch ? { aadhaarBankNameScore: aadhaarBankMatch.score, aadhaarBankNameMatched: aadhaarBankMatch.matched } : {}),
          },

          ipAddress,
          userAgent,
        },
      });

      return record;
    });

    if (status === PlBankVerificationStatus.VERIFIED && loan.applicationId) {
      // Staged profile push (V3) carrying the backend-verified bank details to the
      // lender — reuses the same profile/UPDATE integration as every other stage.
      this.lenderIntegrationOutbox.enqueueUpdateWhenReady(loan.applicationId, 3).catch((err) => {
        this.logger.warn(`Failed to enqueue bank profile update for application ${loan.applicationId}: ${err?.message || err}`);
      });
    }

    if (status === PlBankVerificationStatus.NAME_MISMATCH && this.losRejectionWebhookService) {
      const rejectReason = `Bank verification rejected: Bank account holder name does not match customer name (Fuzzy match score: ${fuzzyMatchScore}, threshold: ${nameMatchThreshold})`;
      await this.losRejectionWebhookService
        .sendRejectionWebhook({
          lan: loan.lan,
          reason: rejectReason,
          lenderId: loan.application?.lenderId || undefined,
          applicationId: loan.applicationId,
        })
        .catch((err) => {
          this.logger.warn(`Failed to dispatch rejection webhook for LAN ${loan.lan}: ${err?.message || err}`);
        });
    }

    if (status === PlBankVerificationStatus.VERIFIED) {
      return {
        success: true,
        message: 'Bank account verified successfully.',
        data: {
          status: 'VERIFIED',
          providerReference,
          accountHolderName,
          beneficiaryNameWithBank: providerBeneficiaryName,
          maskedAccountNumber: accountNumberMasked,
          ifscCode,
          bankName,
          branchName,
          accountType,
          fuzzyMatchScore,
          verifiedAt,
        },
      };
    } else if (status === PlBankVerificationStatus.NAME_MISMATCH) {
      return {
        success: false,
        message: 'The bank account holder name does not sufficiently match your verified identity. Application has been rejected.',
        data: {
          status: 'REJECTED',
          maskedAccountNumber: accountNumberMasked,
          fuzzyMatchScore,
        },
      };
    } else {
      return {
        success: false,
        message: 'Bank account verification failed. Please check your account details and retry.',
        data: {
          status: 'FAILED',
          maskedAccountNumber: accountNumberMasked,
        },
      };
    }
  }

  async processPanOcr(input: { customerId: bigint; file?: any; image?: string }) {
    const customerId = input.customerId;

    let fileBuffer: Buffer | null = null;
    let fileName = 'pan_card.jpg';
    let mimeType = 'image/jpeg';

    if (input.file && input.file.buffer) {
      fileBuffer = input.file.buffer;
      fileName = input.file.originalname || fileName;
      mimeType = input.file.mimetype || mimeType;
    } else if (input.image && typeof input.image === 'string') {
      const match = input.image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        const ext = mimeType.split('/')[1] || 'jpg';
        fileName = `pan_capture.${ext}`;
        fileBuffer = Buffer.from(match[2], 'base64');
      } else {
        fileBuffer = Buffer.from(input.image, 'base64');
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Please upload or capture a valid PAN card image.');
    }

    const clientRefId = `CUST_${customerId}_${Date.now()}`;

    const formData = new FormData();
    formData.append('imageUrl', fileBuffer, {
      filename: fileName,
      contentType: mimeType,
    });
    formData.append('clientRefId', clientRefId);

    const requestPayload = {
      action: 'PAN_OCR',
      clientRefId,
      fileName,
      mimeType,
      fileSize: fileBuffer.length,
    };

    let responseData: any = null;
    try {
      const response = await firstValueFrom(
        this.httpService.post(this.panOcrApiUrl, formData, {
          headers: {
            ...formData.getHeaders(),
            accept: '*/*',
            'X-API-Key': this.panOcrApiKey,
          },
          timeout: this.panApiTimeoutMs,
        }),
      );
      responseData = response.data;
    } catch (err: any) {
      const errorData = err?.response?.data || { message: err?.message || 'PAN OCR request failed.' };
      await this.savePanOcrLog(customerId, requestPayload, errorData, false);
      this.logger.error(`PAN OCR Error: ${err?.message}`, err?.stack);
      throw new BadRequestException(
        errorData?.message || errorData?.error || 'Failed to process PAN OCR. Please upload a clear image or enter details manually.',
      );
    }

    if (!responseData || responseData.success === false) {
      await this.savePanOcrLog(customerId, requestPayload, responseData, false);
      throw new BadRequestException(
        responseData?.message || responseData?.error || 'PAN OCR failed to extract details from image.',
      );
    }

    // 1. Save physical file to uploads/customer-documents/pan-card/YYYY/MM/
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const uploadsBaseDir = join(process.cwd(), 'uploads', 'customer-documents', 'pan-card', year, month);
    if (!existsSync(uploadsBaseDir)) {
      mkdirSync(uploadsBaseDir, { recursive: true });
    }

    const fileExt = mimeType === 'image/png' ? 'png' : mimeType === 'application/pdf' ? 'pdf' : 'jpg';
    const savedFileName = `customer-${customerId}-pan-card-${now.getTime()}.${fileExt}`;
    const fullPath = join(uploadsBaseDir, savedFileName);
    const relativePath = `uploads/customer-documents/pan-card/${year}/${month}/${savedFileName}`;
    const fileUrl = `/${relativePath}`;

    try {
      writeFileSync(fullPath, fileBuffer);
    } catch (fileErr: any) {
      this.logger.error('Failed to write PAN card image file to uploads folder:', fileErr);
    }

    // 2. Save OCR log & extracted data in kyc_verification_status table in DB
    const extracted = responseData?.data || {};
    const panNumber = (extracted.pan_number || extracted.panNumber || extracted.pan || '').trim().toUpperCase();
    const fullName = (extracted.name || extracted.fullName || '').trim();
    const dob = (extracted.dob || '').trim();
    const fatherName = (extracted.father_name || extracted.fatherName || '').trim();

    // Store fatherName directly on Customer model in DB
    if (fatherName) {
      try {
        await this.prisma.customer.update({
          where: { id: customerId },
          data: { fatherName },
        });
        this.logger.log(`Updated customer ${customerId} fatherName to "${fatherName}" from PAN OCR.`);
      } catch (custErr: any) {
        this.logger.warn(`Could not update fatherName on customer record: ${custErr?.message}`);
      }
    }

    await this.savePanOcrLog(customerId, requestPayload, responseData, true, fullName);

    // 3. Save / Update PAN Card document in pl_customer_documents table in DB
    try {
      const latestApp = await this.prisma.plApplication.findFirst({
        where: { customerId },
        orderBy: { id: 'desc' },
        select: { id: true },
      });

      await this.prisma.plCustomerDocument.updateMany({
        where: { customerId, documentType: 'PAN_CARD', status: 'VERIFIED' },
        data: { status: 'REPLACED' },
      });

      await this.prisma.plCustomerDocument.create({
        data: {
          customerId,
          applicationId: latestApp?.id || null,
          documentType: 'PAN_CARD',
          fileName: savedFileName,
          originalFileName: fileName || savedFileName,
          filePath: relativePath,
          fileUrl,
          mimeType,
          fileSize: fileBuffer.length,
          source: 'OCR',
          status: 'VERIFIED',
          metadataJson: this.stringifyJson(responseData),
        },
      });
    } catch (docErr: any) {
      this.logger.warn(`Could not save PAN OCR customer document record in DB: ${docErr?.message}`);
    }

    return {
      success: true,
      message: responseData?.message || 'PAN OCR extracted successfully',
      data: {
        panNumber,
        fullName,
        dob,
        fatherName,
        provider: responseData?.provider || 'FINANALYZ_OCR',
        filePath: relativePath,
        fileUrl: signDocumentUrl(fileUrl),
        rawResponse: responseData,
      },
    };
  }

  private async savePanOcrLog(
    customerId: bigint,
    requestPayload: any,
    responseData: any,
    success: boolean,
    fullName?: string,
  ): Promise<void> {
    try {
      const nameParts = this.parsePersonName(fullName);

      const existingKyc = await this.prisma.kycVerificationStatus.findFirst({
        where: { customerId },
        select: { id: true },
      });

      const kycUpdate = {
        panApiRequest: this.stringifyJson(requestPayload),
        panApiResponse: this.stringifyJson(responseData),
        ...(nameParts.firstName ? { firstName: nameParts.firstName } : {}),
        ...(nameParts.middleName ? { middleName: nameParts.middleName } : {}),
        ...(nameParts.lastName ? { lastName: nameParts.lastName } : {}),
      };

      if (existingKyc) {
        await this.prisma.kycVerificationStatus.update({
          where: { id: existingKyc.id },
          data: kycUpdate,
        });
      } else {
        await this.prisma.kycVerificationStatus.create({
          data: {
            customerId,
            mobileStatus: KycStatus.VERIFIED,
            ...kycUpdate,
          },
        });
      }
    } catch (dbErr: any) {
      this.logger.error('Failed to save PAN OCR log in kyc_verification_status DB table', dbErr?.stack);
    }
  }

  private parsePersonName(fullName?: string): { firstName: string | null; middleName: string | null; lastName: string | null } {
    if (!fullName) return { firstName: null, middleName: null, lastName: null };
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: null, middleName: null, lastName: null };
    if (parts.length === 1) return { firstName: parts[0], middleName: null, lastName: null };
    if (parts.length === 2) return { firstName: parts[0], middleName: null, lastName: parts[1] };
    return {
      firstName: parts[0],
      middleName: parts.slice(1, -1).join(' '),
      lastName: parts[parts.length - 1],
    };
  }
}
