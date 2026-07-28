import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerEligibilityStatus,
  CustomerOnboardingStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

import { LoanService } from '../loan/loan.service';
import { PlApplicationStatus } from '@prisma/client';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loanService: LoanService,
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
    data: any,
  ) {
    const updateData: any = {
      lastActivityAt: new Date(),
    };

    if (data?.fatherName !== undefined && data?.fatherName !== null) {
      updateData.fatherName = String(data.fatherName).trim();
    }

    if (data?.residentialPincode !== undefined && data?.residentialPincode !== null) {
      updateData.residentialPincode = String(data.residentialPincode).trim();
    }

    if (data?.email !== undefined && data?.email !== null) {
      updateData.email = String(data.email).trim().toLowerCase();
    }

    if (data?.emailVerified !== undefined) {
      updateData.emailVerified = data.emailVerified;
      if (data.emailVerified === true) {
        updateData.emailVerifiedAt = new Date();
        updateData.onboardingStatus = CustomerOnboardingStatus.EMAIL_VERIFIED;
      }
    }

    const customer = await this.prisma.customer.update({
      where: {
        id: customerId,
      },
      data: updateData,
    });

    return {
      success: true,
      message: 'Customer basic details updated successfully.',
      data: this.serializeCustomer(customer),
    };
  }

  async updatePincode(
    customerId: bigint,
    data: {
      pincode: string;
      city?: string;
      state?: string;
    },
  ) {
    const trimmedPincode = String(data.pincode || '').trim();
    if (!/^[1-9][0-9]{5}$/.test(trimmedPincode)) {
      throw new BadRequestException('A valid 6-digit PIN code is required.');
    }

    const customer = await (this.prisma as any).customer.update({
      where: {
        id: customerId,
      },
      data: {
        residentialPincode: trimmedPincode,
        residentialCity: data.city ? String(data.city).trim() : null,
        residentialState: data.state ? String(data.state).trim() : null,
        lastActivityAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Residential PIN code, city, and state saved successfully.',
      data: this.serializeCustomer(customer),
    };
  }

  async updateProfile(customerId: bigint, body: any) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid profile data payload.');
    }

    const isSalaried = body.employmentType === 'SALARIED';
    const isSelfEmployed = body.employmentType === 'SELF_EMPLOYED';

    const updateData: any = {
      residenceStatus: body.residenceStatus || null,
      employmentType: body.employmentType || null,
      monthlyIncome:
        body.monthlyIncome !== undefined && body.monthlyIncome !== null && body.monthlyIncome !== ''
          ? Number(body.monthlyIncome)
          : null,
      workPincode: body.workPincode ? String(body.workPincode).trim() : null,
      kfsLanguage: body.kfsLanguage || 'English',

      // Salaried fields
      companyType: isSalaried ? body.companyType || null : null,
      companyName: isSalaried && body.companyName ? String(body.companyName).trim() : null,
      designation: isSalaried && body.designation ? String(body.designation).trim() : null,
      employmentVintage: isSalaried && body.employmentVintage ? String(body.employmentVintage).trim() : null,
      totalExperience: isSalaried && body.totalExperience ? String(body.totalExperience).trim() : null,
      salaryMode: isSalaried && body.salaryMode ? String(body.salaryMode).trim() : null,

      // Self-employed fields
      businessName: isSelfEmployed && body.businessName ? String(body.businessName).trim() : null,
      businessConstitution: isSelfEmployed ? body.businessConstitution || null : null,
      businessVintage: isSelfEmployed && body.businessVintage ? String(body.businessVintage).trim() : null,
      annualTurnover:
        isSelfEmployed && body.annualTurnover !== undefined && body.annualTurnover !== null && body.annualTurnover !== ''
          ? Number(body.annualTurnover)
          : null,

      profileCompletedAt: new Date(),
      lastActivityAt: new Date(),
    };

    const customer = await (this.prisma as any).customer.update({
      where: {
        id: customerId,
      },
      data: updateData,
    });

    return {
      success: true,
      message: 'Profile details saved successfully.',
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
    // Auto-heal: fix any empty-string enum values that can't be read by Prisma
    await this.prisma.$executeRawUnsafe(
      `UPDATE \`customers\` SET \`eligibility_status\` = 'NOT_CHECKED' WHERE \`id\` = ? AND (\`eligibility_status\` = '' OR \`eligibility_status\` IS NULL)`,
      customerId,
    ).catch(() => { /* ignore if heal fails */ });

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        applications: {
          orderBy: { id: 'desc' },
          take: 1,
          include: { loans: { orderBy: { id: 'desc' }, take: 1 } },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    let latestSuccessPayment: any = null;
    try {
      const paymentRows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT \`txnid\`, \`amount\`, \`purpose\`, \`status\`, \`paid_at\` AS paidAt FROM \`pl_payment_links\` WHERE \`customer_id\` = ? AND \`status\` = 'SUCCESS' ORDER BY \`id\` DESC LIMIT 1`,
        customerId,
      );
      if (paymentRows && paymentRows.length > 0) {
        latestSuccessPayment = paymentRows[0];
      }
    } catch (e) {
      latestSuccessPayment = null;
    }

    const latestApp = customer.applications[0] ?? null;
    const latestLoan = latestApp?.loans[0] ?? null;

    // Explicitly build response — never spread raw Prisma objects with BigInt fields
    return {
      success: true,
      data: {
        id: customer.id.toString(),
        customerCode: customer.customerCode,
        countryCode: customer.countryCode,
        mobileNumber: customer.mobileNumber,
        mobileVerified: customer.mobileVerified,
        mobileVerifiedAt: customer.mobileVerifiedAt,
        fullName: customer.fullName,
        firstName: customer.firstName,
        middleName: customer.middleName,
        lastName: customer.lastName,
        fatherName: customer.fatherName,
        panNumber: customer.panNumber,
        panVerified: customer.panVerified,
        panVerifiedAt: customer.panVerifiedAt,
        dateOfBirth: customer.dateOfBirth,
        gender: customer.gender,
        email: customer.email,
        emailVerified: customer.emailVerified,
        emailVerifiedAt: customer.emailVerifiedAt,
        residentialPincode: customer.residentialPincode,
        residentialCity: customer.residentialCity,
        residentialState: customer.residentialState,
        workPincode: customer.workPincode,
        residenceStatus: customer.residenceStatus,
        employmentType: customer.employmentType,
        companyType: customer.companyType,
        companyName: customer.companyName,
        designation: customer.designation,
        businessName: customer.businessName,
        businessConstitution: customer.businessConstitution,
        monthlyIncome: customer.monthlyIncome ? Number(customer.monthlyIncome) : null,
        annualTurnover: customer.annualTurnover ? Number(customer.annualTurnover) : null,
        employmentVintage: customer.employmentVintage,
        totalExperience: customer.totalExperience,
        salaryMode: customer.salaryMode,
        businessVintage: customer.businessVintage,
        accountStatus: customer.accountStatus,
        onboardingStatus: customer.onboardingStatus,
        eligibilityStatus: customer.eligibilityStatus,
        eligibilityReason: customer.eligibilityReason,
        latestApplicationId: customer.latestApplicationId?.toString() ?? null,
        lastLoginAt: customer.lastLoginAt,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        // Application & loan info
        latestApplicationStatus: latestApp?.status ?? null,
        latestLan: latestLoan?.lan ?? null,
        latestLoanId: latestLoan?.id?.toString() ?? null,
        latestLoanStatus: latestLoan?.status ?? null,
        // Payment
        assessmentFeePaid: Boolean(latestSuccessPayment),
        latestPayment: latestSuccessPayment ? {
          txnid: latestSuccessPayment.txnid,
          amount: Number(latestSuccessPayment.amount),
          purpose: latestSuccessPayment.purpose,
          status: latestSuccessPayment.status,
          paidAt: latestSuccessPayment.paidAt
            ? new Date(latestSuccessPayment.paidAt).toISOString()
            : null,
        } : null,
      },
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

  async submitApplication(customerId: bigint, body: any) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const dateStr = new Date().toISOString().slice(2, 10).replaceAll('-', '');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const applicationNumber = `PL-APP-${dateStr}-${randomNum}`;

    const application = await this.prisma.plApplication.create({
      data: {
        customerId,
        applicationNumber,
        status: PlApplicationStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });

    const updatedCustomer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        latestApplicationId: application.id,
        onboardingStatus: CustomerOnboardingStatus.APPLICATION_SUBMITTED,
        profileCompletedAt: customer.profileCompletedAt || new Date(),
        lastActivityAt: new Date(),
      },
    });

    this.logger.log(`Application ${applicationNumber} submitted for customer ${customer.customerCode}.`);

    return {
      success: true,
      message: 'Application submitted successfully for final approval.',
      data: {
        customerId: customer.id.toString(),
        customerCode: customer.customerCode,
        applicationNumber,
        applicationId: application.id.toString(),
        status: 'APPLICATION_SUBMITTED',
        statusLabel: 'Under Final Approval',
        submittedAt: new Date().toISOString(),
        estimatedReviewTimeHours: 24,
        customer: this.serializeCustomer(updatedCustomer),
      },
    };
  }

  async simulateLenderApproval(customerId: bigint, body: any) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        applications: {
          orderBy: { id: 'desc' },
          take: 1,
        }
      }
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    
    if (!customer.applications || customer.applications.length === 0) {
      throw new BadRequestException('Customer has no applications');
    }
    
    const latestApp = customer.applications[0];

    const status = body?.approved === false ? CustomerOnboardingStatus.LENDER_REJECTED : CustomerOnboardingStatus.LENDER_APPROVED;

    // Update application
    await this.prisma.plApplication.update({
      where: { id: latestApp.id },
      data: {
        status: status === CustomerOnboardingStatus.LENDER_APPROVED ? PlApplicationStatus.LENDER_APPROVED : PlApplicationStatus.LENDER_REJECTED,
        lenderDecisionAt: new Date(),
        approvedAmount: status === CustomerOnboardingStatus.LENDER_APPROVED ? 15000 : null, // Dummy amount
      }
    });

    let loan = null;
    if (status === CustomerOnboardingStatus.LENDER_APPROVED) {
      loan = await this.loanService.createLoanAfterApproval(latestApp.id, customerId, 15000);
    }

    const updatedCustomer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        onboardingStatus: status,
        lastActivityAt: new Date(),
      },
    });

    this.logger.log(`Customer ${customer.customerCode} onboarding status updated to ${status}.`);

    return {
      success: true,
      message: `Application status updated to ${status}.`,
      data: {
        customerId: customer.id.toString(),
        onboardingStatus: status,
        statusLabel: status === CustomerOnboardingStatus.LENDER_APPROVED ? 'Lender Approved' : 'Lender Rejected',
        lan: loan?.lan,
        customer: this.serializeCustomer(updatedCustomer),
      },
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