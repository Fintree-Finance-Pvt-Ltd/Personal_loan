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
} from '@prisma/client';
import { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
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

  // Face Liveness Configuration
  private readonly faceLivenessApiUrl: string;
  private readonly faceLivenessAuthHeader: string;
  private readonly faceLivenessTimeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // PAN API Setup
    this.panApiUrl = this.configService.getOrThrow<string>('PAN_API_URL');
    this.panApiKey = this.configService.getOrThrow<string>('PAN_API_KEY');
    this.panApiTimeoutMs = Number(
      this.configService.get<string>('PAN_API_TIMEOUT_MS', '15000'),
    );

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

    const customerId = this.parseCustomerId(String(input.customerId || ''));

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

    const clientRefNum = input.clientRefNum || `LIVENESS_${customerId}_${Date.now()}`.slice(0, 45);

    const requestPayload = {
      input_image: input.inputImage,
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

      return {
        success: true,
        message: 'Face liveness check processed successfully.',
        data: {
          customerId: customer.id.toString(),
          customerCode: customer.customerCode,
          reqId: providerData.req_id,
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
}