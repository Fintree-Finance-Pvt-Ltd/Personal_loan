import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerEligibilityStatus,
  CustomerOnboardingStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findOrCreateAfterOtpVerification(
    mobileNumber: string,
  ) {
    const normalizedMobile =
      this.normalizeMobileNumber(mobileNumber);

    const now = new Date();

    /*
     * Upsert is atomic.
     *
     * If the mobile already exists:
     * - no new customer ID is created
     * - login timestamps are updated
     *
     * If it does not exist:
     * - a new customer is created
     */
    const customer = await this.prisma.customer.upsert({
      where: {
        mobileNumber: normalizedMobile,
      },

      update: {
        mobileVerified: true,
        mobileVerifiedAt: now,
        lastLoginAt: now,
        lastActivityAt: now,
      },

      create: {
        customerCode: this.generateCustomerCode(),
        countryCode: '+91',
        mobileNumber: normalizedMobile,
        mobileVerified: true,
        mobileVerifiedAt: now,
        lastLoginAt: now,
        lastActivityAt: now,
        onboardingStatus:
          CustomerOnboardingStatus.MOBILE_VERIFIED,
        eligibilityStatus:
          CustomerEligibilityStatus.NOT_CHECKED,
      },
    });

    return {
      success: true,
      message: 'Customer login completed successfully.',
      data: this.serializeCustomer(customer),
    };
  }

  async updatePanVerification(
    customerId: bigint,
    panData: {
      panNumber: string;
      fullName: string;
      firstName?: string | null;
      middleName?: string | null;
      lastName?: string | null;
      dateOfBirth?: string | null;
      gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
      providerApplicationId?: string | null;
      typeOfHolder?: string | null;
    },
  ) {
    const normalizedPan = panData.panNumber
      .trim()
      .toUpperCase();

    const existingPanCustomer =
      await this.prisma.customer.findFirst({
        where: {
          panNumber: normalizedPan,
          NOT: {
            id: customerId,
          },
        },
        select: {
          id: true,
          customerCode: true,
        },
      });

    if (existingPanCustomer) {
      throw new ConflictException(
        'This PAN is already linked to another customer.',
      );
    }

    const dateOfBirth = panData.dateOfBirth
      ? this.parseIsoDate(panData.dateOfBirth)
      : null;

    const customer =
      await this.prisma.customer.update({
        where: {
          id: customerId,
        },

        data: {
          panNumber: normalizedPan,
          panVerified: true,
          panVerifiedAt: new Date(),

          fullName:
            panData.fullName.trim().replace(/\s+/g, ' '),

          firstName:
            panData.firstName?.trim() || null,

          middleName:
            panData.middleName?.trim() || null,

          lastName:
            panData.lastName?.trim() || null,

          dateOfBirth,

          gender: panData.gender || null,

          panProviderApplicationId:
            panData.providerApplicationId || null,

          panHolderType:
            panData.typeOfHolder || null,

          onboardingStatus:
            CustomerOnboardingStatus.PAN_VERIFIED,

          lastActivityAt: new Date(),
        },
      });

    return {
      success: true,
      message: 'Customer PAN details saved successfully.',
      data: this.serializeCustomer(customer),
    };
  }

  async updateBasicDetails(
    customerId: bigint,
    data: {
      fatherName: string;
      residentialPincode: string;
      email: string;
      emailVerified?: boolean;
    },
  ) {
    const customer =
      await this.prisma.customer.update({
        where: {
          id: customerId,
        },

        data: {
          fatherName: data.fatherName.trim(),
          residentialPincode:
            data.residentialPincode.trim(),
          email: data.email.trim().toLowerCase(),

          emailVerified:
            data.emailVerified ?? false,

          emailVerifiedAt:
            data.emailVerified === true
              ? new Date()
              : null,

          onboardingStatus:
            data.emailVerified === true
              ? CustomerOnboardingStatus.EMAIL_VERIFIED
              : CustomerOnboardingStatus.BASIC_DETAILS_PENDING,

          lastActivityAt: new Date(),
        },
      });

    return {
      success: true,
      message: 'Customer details updated successfully.',
      data: this.serializeCustomer(customer),
    };
  }

  async updateEligibilityResult(
    customerId: bigint,
    result: {
      eligible: boolean;
      reason?: string | null;
    },
  ) {
    const customer =
      await this.prisma.customer.update({
        where: {
          id: customerId,
        },

        data: {
          eligibilityStatus: result.eligible
            ? CustomerEligibilityStatus.ELIGIBLE
            : CustomerEligibilityStatus.INELIGIBLE,

          onboardingStatus: result.eligible
            ? CustomerOnboardingStatus.PLATFORM_ELIGIBLE
            : CustomerOnboardingStatus.PLATFORM_INELIGIBLE,

          eligibilityReason:
            result.reason?.trim() || null,

          eligibilityCheckedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });

    return {
      success: true,

      message: result.eligible
        ? 'Customer is eligible.'
        : 'Customer is not eligible.',

      data: this.serializeCustomer(customer),
    };
  }

  async updateProfessionalDetails(
    customerId: bigint,
    data: Prisma.CustomerUpdateArgs['data'],
  ) {
    const customer =
      await this.prisma.customer.update({
        where: {
          id: customerId,
        },

        data: {
          ...data,
          onboardingStatus:
            CustomerOnboardingStatus.APPLICATION_IN_PROGRESS,
          lastActivityAt: new Date(),
        },
      });

    return {
      success: true,
      message:
        'Professional details updated successfully.',
      data: this.serializeCustomer(customer),
    };
  }

  async findById(customerId: bigint) {
    const customer =
      await this.prisma.customer.findUnique({
        where: {
          id: customerId,
        },
      });

    if (!customer) {
      throw new NotFoundException(
        'Customer not found.',
      );
    }

    return {
      success: true,
      data: this.serializeCustomer(customer),
    };
  }

  async findByMobile(mobileNumber: string) {
    const customer =
      await this.prisma.customer.findUnique({
        where: {
          mobileNumber:
            this.normalizeMobileNumber(mobileNumber),
        },
      });

    if (!customer) {
      throw new NotFoundException(
        'Customer not found.',
      );
    }

    return {
      success: true,
      data: this.serializeCustomer(customer),
    };
  }

  private normalizeMobileNumber(
    mobileNumber: string,
  ): string {
    const normalized = mobileNumber.replace(/\D/g, '');

    const tenDigitMobile =
      normalized.length === 12 &&
      normalized.startsWith('91')
        ? normalized.slice(2)
        : normalized;

    if (!/^[6-9][0-9]{9}$/.test(tenDigitMobile)) {
      throw new ConflictException(
        'Enter a valid Indian mobile number.',
      );
    }

    return tenDigitMobile;
  }

  private generateCustomerCode(): string {
    const datePart = new Date()
      .toISOString()
      .slice(2, 10)
      .replaceAll('-', '');

    const randomPart = randomBytes(3)
      .toString('hex')
      .toUpperCase();

    return `CUS-${datePart}-${randomPart}`;
  }

  private parseIsoDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new ConflictException(
        'Date of birth must use YYYY-MM-DD format.',
      );
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      throw new ConflictException(
        'Invalid date of birth.',
      );
    }

    return date;
  }

  private serializeCustomer<
    T extends {
      id: bigint;
      latestApplicationId: bigint | null;
    },
  >(customer: T) {
    return {
      ...customer,
      id: customer.id.toString(),

      latestApplicationId:
        customer.latestApplicationId?.toString() ??
        null,
    };
  }
}