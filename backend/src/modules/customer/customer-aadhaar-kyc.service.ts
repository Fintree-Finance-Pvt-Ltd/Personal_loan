import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DigitapDigilockerService } from '../external-api/digitap-digilocker.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CustomerAadhaarKycService {
  private readonly logger = new Logger(CustomerAadhaarKycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly digitapService: DigitapDigilockerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Initiates DigiLocker Aadhaar KYC for pre-approval onboarding stage
   */
  async initiate(
    user: any,
    body?: { customerId?: number | string; customerCode?: string; consentGiven?: boolean },
  ) {
    const rawCustomerId = user?.customerId || user?.id || user?.userId || body?.customerId;
    const customerCodeInput = body?.customerCode;

    let customer = null;
    if (rawCustomerId) {
      customer = await this.prisma.customer.findUnique({
        where: { id: BigInt(rawCustomerId) },
      });
    } else if (customerCodeInput) {
      customer = await this.prisma.customer.findUnique({
        where: { customerCode: customerCodeInput },
      });
    }

    if (!customer) {
      throw new BadRequestException('Customer identity could not be resolved.');
    }

    if (!customer.customerCode) {
      throw new BadRequestException('Customer reference code is missing.');
    }

    if (customerCodeInput && customerCodeInput !== customer.customerCode) {
      throw new BadRequestException('Invalid customer reference code.');
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

    // Create unique attempt reference using customerCode
    const attemptReference = `DLK_${customer.customerCode}_${Date.now()}`;

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

    this.logger.log(`DigiLocker KYC initiated for customer ${customer.customerCode} (Ref: ${attemptReference})`);

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
  async getStatus(user: any, queryCustomerId?: string, queryCustomerCode?: string) {
    const rawCustomerId = user?.customerId || user?.id || user?.userId || queryCustomerId;

    let customer = null;
    if (rawCustomerId) {
      customer = await this.prisma.customer.findUnique({
        where: { id: BigInt(rawCustomerId) },
      });
    } else if (queryCustomerCode) {
      customer = await this.prisma.customer.findUnique({
        where: { customerCode: queryCustomerCode },
      });
    }

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
   * Manually checks & updates live DigiLocker status with provider
   */
  async refreshStatus(user: any, body?: { customerId?: number | string; customerCode?: string }) {
    const rawCustomerId = user?.customerId || user?.id || user?.userId || body?.customerId;
    const customerCodeInput = body?.customerCode;

    let customer = null;
    if (rawCustomerId) {
      customer = await this.prisma.customer.findUnique({
        where: { id: BigInt(rawCustomerId) },
      });
    } else if (customerCodeInput) {
      customer = await this.prisma.customer.findUnique({
        where: { customerCode: customerCodeInput },
      });
    }

    if (!customer) {
      throw new NotFoundException('Customer identity could not be resolved.');
    }

    if (customer.aadhaarVerified || customer.digilockerStatus === 'VERIFIED') {
      return this.getStatus(user, rawCustomerId?.toString(), customerCodeInput);
    }

    const transactionId = customer.digilockerSessionId;
    if (!transactionId) {
      return this.getStatus(user, rawCustomerId?.toString(), customerCodeInput);
    }

    try {
      const providerDetails = await this.digitapService.getDigitapDigilockerDetails(transactionId);
      if (providerDetails) {
        await this.processAndPersistVerifiedDetails(customer.id, providerDetails);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to refresh DigiLocker status for customer ${customer.customerCode}: ${error?.message}`);
    }

    return this.getStatus(user, rawCustomerId?.toString(), customerCodeInput);
  }

  /**
   * Handles incoming DigiLocker Webhook / Callback from Provider
   */
  async handleWebhook(payload: any) {
    const transactionId = payload?.model?.transactionId || payload?.transactionId;
    const attemptReference = payload?.model?.uid || payload?.uid;

    if (!transactionId && !attemptReference) {
      this.logger.warn('DigiLocker webhook received without transactionId or attemptReference');
      return { status: 'Ignored', message: 'Missing transaction identifier' };
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        OR: [
          ...(transactionId ? [{ digilockerSessionId: transactionId }] : []),
          ...(attemptReference ? [{ digilockerReference: attemptReference }] : []),
        ],
      },
    });

    if (!customer) {
      this.logger.warn(`DigiLocker webhook received for unknown transaction: ${transactionId || attemptReference}`);
      return { status: 'Ignored', message: 'Customer not found' };
    }

    if (customer.aadhaarVerified || customer.digilockerStatus === 'VERIFIED') {
      return { status: 'Success', acknowledged: true, duplicate: true };
    }

    await this.processAndPersistVerifiedDetails(customer.id, payload);
    return { status: 'Success', acknowledged: true };
  }

  /**
   * Normalizes provider details and updates PlCustomer record atomically
   */
  private async processAndPersistVerifiedDetails(customerId: bigint, providerResponse: any) {
    const model = providerResponse?.model || providerResponse;
    const aadhaarData = model?.aadhaarData || model?.kycData || model;

    const rawAadhaar = aadhaarData?.aadhaarNumber || aadhaarData?.uid || '';
    const lastFour = rawAadhaar.replace(/\D/g, '').slice(-4) || 'XXXX';
    const maskedAadhaar = rawAadhaar ? `XXXX-XXXX-${lastFour}` : `XXXX-XXXX-${lastFour}`;

    const verifiedName = aadhaarData?.name || model?.name || null;
    const verifiedDob = aadhaarData?.dob || model?.dob || null;
    const verifiedGender = aadhaarData?.gender || model?.gender || null;

    let dobDate: Date | null = null;
    if (verifiedDob) {
      try {
        const parts = verifiedDob.split(/[-/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            dobDate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
          } else {
            dobDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          }
        }
      } catch {
        dobDate = null;
      }
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        aadhaarVerified: true,
        aadhaarKycStatus: 'VERIFIED',
        digilockerStatus: 'VERIFIED',
        maskedAadhaar,
        aadhaarLastFourDigits: lastFour,
        aadhaarVerifiedAt: new Date(),
        digilockerVerifiedAt: new Date(),
        digilockerRawResponse: JSON.stringify(providerResponse),
        ...(verifiedName ? { fullName: verifiedName } : {}),
        ...(dobDate ? { dateOfBirth: dobDate } : {}),
        ...(verifiedGender ? { gender: verifiedGender } : {}),
      },
    });

    this.logger.log(`Aadhaar KYC successfully VERIFIED for customer ID: ${customerId}`);
  }
}
