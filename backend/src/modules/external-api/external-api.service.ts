import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
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
import { AxiosError, AxiosResponse } from 'axios';
import * as FormData from 'form-data';
import { LenderIntegrationOutboxService } from '../lender-integrations/lender-integration-outbox.service';
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
  ) {
    // PAN API Setup
    this.panApiUrl = this.configService.getOrThrow<string>('PAN_API_URL');
    this.panApiKey = this.configService.getOrThrow<string>('PAN_API_KEY');
    this.panApiTimeoutMs = Number(
      this.configService.get<string>('PAN_API_TIMEOUT_MS', '15000'),
    );

    this.panOcrApiUrl = this.configService.get<string>('PAN_OCR_API_URL') || 'https://sandbox.fintreelms.com/ocr/v1/pan';
    this.panOcrApiKey = this.configService.get<string>('PAN_OCR_API_KEY') || 'Fintree@2026';

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

    const normalizedPan = String(input.panNumber || '')
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

    const requestPayload = { panNumber: normalizedPan };

    await this.markPanInitiated(customerId, requestPayload);

    try {
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
              },
            },
          ),
        );

      const providerResponse = response.data?.data?.response;
      const providerStatus = response.data?.data?.status;

      if (!providerResponse) {
        await this.markPanFailed(customerId, requestPayload, response.data);
        throw new BadGatewayException({
          success: false,
          message: 'PAN verification provider returned an invalid response.',
        });
      }

      if (providerStatus?.statusCode && providerStatus.statusCode !== 200) {
        await this.markPanFailed(customerId, requestPayload, response.data);
        throw new BadGatewayException({
          success: false,
          message:
            providerStatus.statusMessage ||
            'PAN verification provider rejected the request.',
        });
      }

      if (providerResponse.code && providerResponse.code !== 200) {
        await this.markPanFailed(customerId, requestPayload, response.data);
        throw new BadGatewayException({
          success: false,
          message: 'PAN verification could not be completed.',
        });
      }

      if (!providerResponse.isValid) {
        await this.markPanFailed(customerId, requestPayload, response.data);
        throw new BadRequestException({
          success: false,
          message: 'The PAN number is invalid.',
          data: {
            panNumber: normalizedPan,
            isValid: false,
          },
        });
      }

      const normalizedData = this.normalizePanResponse(
        normalizedPan,
        response.data,
      );

      if (!normalizedData.fullName) {
        await this.markPanFailed(customerId, requestPayload, response.data);
        throw new BadGatewayException(
          'PAN provider did not return the customer name.',
        );
      }

      const updatedCustomer = await this.saveVerifiedPan({
        customerId,
        normalizedData,
        rawRequest: requestPayload,
        rawResponse: response.data,
      });

      this.logger.log(
        `PAN verification completed for customer ${updatedCustomer.customerCode}, PAN ending ${normalizedPan.slice(-4)}.`,
      );

      return {
        success: true,
        message: 'PAN verified and customer details saved successfully.',
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
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException ||
        error instanceof BadGatewayException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      await this.markPanFailed(
        customerId,
        requestPayload,
        this.getSafeErrorForStorage(error),
      );

      this.handlePanApiError(error);
    }
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

  private normalizePanResponse(requestedPan: string, response: FinanalyzPanResponse): NormalizedPanVerificationData {
    const providerData = response.data;
    const panDetails = providerData?.response;
    const status = providerData?.status;

    return {
      providerApplicationId: providerData?.applicationId || null,
      panNumber: panDetails?.pan?.trim().toUpperCase() || requestedPan,
      isValid: Boolean(panDetails?.isValid),
      fullName: this.cleanOptionalText(panDetails?.name),
      firstName: this.cleanOptionalText(panDetails?.firstName),
      middleName: this.cleanOptionalText(panDetails?.middleName),
      lastName: this.cleanOptionalText(panDetails?.lastName),
      gender: this.mapGender(panDetails?.gender),
      dateOfBirth: this.convertDateToIso(panDetails?.dob),
      maskedAadhaar: this.cleanOptionalText(panDetails?.maskedAadhaar),
      aadhaarLastFourDigits: this.extractAadhaarLastFourDigits(
        panDetails?.lastFourDigit || panDetails?.maskedAadhaar,
      ),
      aadhaarSeedingStatus: typeof panDetails?.aadhaarSeedingStatus === 'boolean'
        ? panDetails.aadhaarSeedingStatus
        : null,
      typeOfHolder: this.cleanOptionalText(panDetails?.typeOfHolder),
      address: this.cleanOptionalText(panDetails?.address),
      city: this.cleanOptionalText(panDetails?.city),
      state: this.cleanOptionalText(panDetails?.state),
      country: this.cleanOptionalText(panDetails?.country),
      pincode: this.cleanOptionalText(panDetails?.pincode),
      maskedMobile: this.cleanOptionalText(panDetails?.mobile_no),
      maskedEmail: this.cleanOptionalText(panDetails?.email),
      providerStatusCode: typeof status?.statusCode === 'number' ? status.statusCode : null,
      providerStatusMessage: this.cleanOptionalText(status?.statusMessage),
      providerTimestamp: this.cleanOptionalText(status?.timestamp),
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
    const match = dateOfBirth.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
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
    const digioRes = await this.digioBankService.verifyBankAccount({
      accountNo: accountNumber,
      ifsc: ifscCode,
      name: accountHolderName,
    });

    // Compute Name Matching Score
    let fuzzyMatchScore = digioRes.fuzzyMatchScore;
    if (fuzzyMatchScore === null || fuzzyMatchScore === undefined) {
      const customerFullName = loan.customer?.fullName || accountHolderName;
      const providerName = digioRes.beneficiaryNameWithBank || accountHolderName;

      fuzzyMatchScore = await this.digioBankService.fuzzyMatch({
        sourceText: customerFullName,
        targetText: providerName,
      });
    }

    const nameMatchThreshold = Number(this.configService.get('DIGIO_BANK_NAME_MATCH_THRESHOLD') || '75');
    const nameMatched = Boolean(digioRes.verified && (fuzzyMatchScore >= nameMatchThreshold));

    let status: PlBankVerificationStatus;
    if (digioRes.verified) {
      status = nameMatched ? PlBankVerificationStatus.VERIFIED : PlBankVerificationStatus.NAME_MISMATCH;
    } else {
      status = PlBankVerificationStatus.FAILED;
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
            nameMatchThreshold,
            status,
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
        message: 'The bank account holder name does not sufficiently match your verified identity.',
        data: {
          status: 'NAME_MISMATCH',
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
