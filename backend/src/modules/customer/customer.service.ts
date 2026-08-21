import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { PlApplicationStatus, PolicyDecisionOutcome } from '@prisma/client';
import { ACTIVE_APPLICATION_STATUSES } from '../../common/constants/application.constants';
import { PlatformPoliciesService } from '../platform-policies/platform-policies.service';
import { PolicyEvaluationService } from '../platform-policies/policy-evaluation.service';
import { MlmAllocationEngineService } from '../mlm/services/mlm-allocation-engine/mlm-allocation-engine.service';

import { ApplicationTransitionService } from '../loan/services/application-transition.service';
import { LenderIntegrationOutboxService } from '../lender-integrations/lender-integration-outbox.service';
import { ProductCalculationService } from '../products/product-calculation.service';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loanService: LoanService,
    private readonly platformPoliciesService: PlatformPoliciesService,
    private readonly policyEvaluationService: PolicyEvaluationService,
    private readonly mlmAllocationEngineService: MlmAllocationEngineService,
    private readonly applicationTransitionService: ApplicationTransitionService,
    private readonly lenderIntegrationOutbox: LenderIntegrationOutboxService,
    private readonly productCalculationService: ProductCalculationService,
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
    const monthlyIncome = Number(body.monthlyIncome);
    if ((!isSalaried && !isSelfEmployed) || !Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
      throw new BadRequestException('Complete employment details and a valid monthly income are required.');
    }
    if (isSalaried && (!body.companyName || !body.designation)) throw new BadRequestException('Employer name and designation are required.');
    if (isSelfEmployed && (!body.businessName || !body.businessConstitution)) throw new BadRequestException('Business name and constitution are required.');

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

    const result = await this.prisma.$transaction(async (tx) => {
      const application = await tx.plApplication.findFirst({ where: { customerId }, orderBy: { id: 'desc' } });
      if (!application) throw new BadRequestException('Canonical application was not found.');
      const customer = await tx.customer.update({ where: { id: customerId }, data: updateData });
      await tx.applicationEmploymentSnapshot.upsert({
        where: { applicationId: application.id },
        create: { applicationId: application.id, employmentType: body.employmentType, companyType: isSalaried ? body.companyType || null : null, companyName: isSalaried ? String(body.companyName).trim() : null, designation: isSalaried ? String(body.designation).trim() : null, businessName: isSelfEmployed ? String(body.businessName).trim() : null, businessConstitution: isSelfEmployed ? body.businessConstitution : null, monthlyIncome, annualTurnover: isSelfEmployed && body.annualTurnover ? Number(body.annualTurnover) : null, employmentVintage: isSalaried ? body.employmentVintage || null : null, businessVintage: isSelfEmployed ? body.businessVintage || null : null, salaryMode: isSalaried ? body.salaryMode || null : null, completedAt: new Date() },
        update: { employmentType: body.employmentType, companyType: isSalaried ? body.companyType || null : null, companyName: isSalaried ? String(body.companyName).trim() : null, designation: isSalaried ? String(body.designation).trim() : null, businessName: isSelfEmployed ? String(body.businessName).trim() : null, businessConstitution: isSelfEmployed ? body.businessConstitution : null, monthlyIncome, annualTurnover: isSelfEmployed && body.annualTurnover ? Number(body.annualTurnover) : null, employmentVintage: isSalaried ? body.employmentVintage || null : null, businessVintage: isSelfEmployed ? body.businessVintage || null : null, salaryMode: isSalaried ? body.salaryMode || null : null, completedAt: new Date() },
      });
      return { customer, applicationId: application.id };
    });
    await this.lenderIntegrationOutbox.enqueueUpdateWhenReady(result.applicationId);

    return {
      success: true,
      message: 'Profile details saved successfully.',
      data: this.serializeCustomer(result.customer),
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
    await this.prisma.$executeRaw`UPDATE customers SET eligibility_status = 'NOT_CHECKED' WHERE id = ${customerId} AND (eligibility_status = '' OR eligibility_status IS NULL)`.catch(() => { /* ignore if heal fails */ });

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        applications: {
          orderBy: { id: 'desc' },
          take: 1,
          include: {
            loans: { orderBy: { id: 'desc' }, take: 1 },
            lenderApplicationLink: true,
            lenderIntegrationOutbox: { orderBy: { createdAt: 'desc' }, take: 1 },
            employmentSnapshot: true,
            kycSnapshot: true,
            addresses: true,
            liveness: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const latestApp = customer.applications[0] ?? null;

    // Repeat customers reuse their Customer-level Aadhaar verification and never go through
    // DigiLocker again for a fresh application, so the side effect that normally seeds this
    // application's own ApplicationKycSnapshot (customer-aadhaar-kyc.service.ts's
    // snapshotVerifiedApplicationKyc, triggered only by a live DigiLocker callback) never runs
    // here. Without it, getUpdateReadiness() keeps reporting DIGILOCKER_KYC_NOT_VERIFIED /
    // AADHAAR_VERIFIED_NAME_MISSING for this application forever, looping the customer back to
    // the Aadhaar step every time they click Save & Next. Backfill it from their most recently
    // verified application instead of forcing a re-verification (same pattern as the
    // ApplicationAddress backfill in saveApplicationAddress()).
    if (latestApp && !latestApp.kycSnapshot && customer.aadhaarVerified) {
      const priorSnapshot = await this.prisma.applicationKycSnapshot.findFirst({
        where: { verificationStatus: 'VERIFIED', application: { customerId } },
        orderBy: { applicationId: 'desc' },
      });
      if (priorSnapshot) {
        (latestApp as any).kycSnapshot = await this.prisma.applicationKycSnapshot.create({
          data: {
            applicationId: latestApp.id,
            provider: priorSnapshot.provider,
            providerReference: priorSnapshot.providerReference,
            verificationStatus: priorSnapshot.verificationStatus,
            maskedAadhaar: priorSnapshot.maskedAadhaar,
            verifiedName: priorSnapshot.verifiedName,
            verifiedDateOfBirth: priorSnapshot.verifiedDateOfBirth,
            verifiedGender: priorSnapshot.verifiedGender,
            verifiedAt: priorSnapshot.verifiedAt,
          },
        });
      }
    }

    const latestSuccessPayment = latestApp
      ? await this.prisma.plPaymentLink.findFirst({
        where: {
          customerId,
          applicationId: latestApp.id,
          purpose: 'ASSESSMENT_FEE',
          status: 'SUCCESS',
        },
        orderBy: { paidAt: 'desc' },
      })
      : null;
    const latestLoan = latestApp?.loans[0] ?? null;
    // Deliberately NOT scoped to latestApp — once a repeat customer's fresh (loan-less)
    // application exists, latestApp.loans is empty and latestLoan above correctly becomes
    // null for nextPermittedStep()'s purposes. But the Dashboard's "you have a fully repaid
    // loan" signal must survive that: it needs the customer's most recent loan across ALL
    // their applications, not just whichever application happens to be "latest".
    const mostRecentLoan = await this.prisma.plLoan.findFirst({
      where: { customerId },
      orderBy: { id: 'desc' },
    });

    let allocatedLenderName: string | null = null;
    if (latestApp?.lenderId) {
      const lender = await this.prisma.lender.findUnique({
        where: { id: latestApp.lenderId },
      });
      allocatedLenderName = lender?.displayName ?? lender?.legalName ?? null;
    }
    let updateReadiness = { ready: false, reasons: ['APPLICATION_MISSING'] as string[] };
    if (latestApp) {
      try {
        const readiness = await this.lenderIntegrationOutbox.getUpdateReadiness(latestApp.id);
        updateReadiness = { ready: readiness.ready, reasons: readiness.reasons };
      } catch {
        updateReadiness = { ready: false, reasons: ['READINESS_UNAVAILABLE'] };
      }
    }
    const link = latestApp?.lenderApplicationLink ?? null;
    const currentOutbox = latestApp?.lenderIntegrationOutbox?.[0] ?? null;
    let hasDecisionConsents = false;
    if (latestApp) {
      const requiredConsentTypes = ['BUREAU_ENQUIRY', 'LENDER_CREDIT_ASSESSMENT', 'LENDER_DECISION_REQUEST'];
      const decisionConsents = await this.prisma.applicationStageConsent.findMany({
        where: { applicationId: latestApp.id, consentType: { in: requiredConsentTypes as any }, revokedAt: null },
      });
      hasDecisionConsents = requiredConsentTypes.every((type) => decisionConsents.some((c) => c.consentType === type));
    }
    // Scoped to the customer's current application, not just their customerId — an
    // Account Aggregator success from a PREVIOUS (now closed) loan must not silently
    // satisfy this step for a fresh application; the customer must reconnect their bank
    // statement again for every new loan.
    const aaRequest = latestApp
      ? await this.prisma.customerAccountAggregatorRequest.findFirst({
          where: { customerId: customer.id, applicationId: latestApp.id, status: 'SUCCESS' },
        })
      : null;
    const aaCompleted = Boolean(aaRequest);
    const aaStatus = aaRequest?.status || 'NOT_STARTED';

    const nextPermittedStep = this.nextPermittedStep({ application: latestApp, payment: latestSuccessPayment, link, outbox: currentOutbox, updateReadiness, loan: latestLoan, hasDecisionConsents, aaCompleted });

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
        latestApplicationReference: latestApp?.applicationNumber ?? null,
        lastLoginAt: customer.lastLoginAt,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        // Aadhaar DigiLocker KYC
        aadhaarVerified: Boolean(customer.aadhaarVerified || customer.digilockerStatus === 'VERIFIED'),
        aadhaarKycStatus: customer.aadhaarKycStatus || customer.digilockerStatus || null,
        maskedAadhaar: customer.maskedAadhaar || null,
        aadhaarLastFourDigits: customer.aadhaarLastFourDigits || null,
        aadhaarVerifiedAt: customer.aadhaarVerifiedAt || customer.digilockerVerifiedAt || null,
        // Application & loan info
        latestApplicationStatus: latestApp?.status ?? null,
        latestApplicationPlatformProductId: latestApp?.platformProductId ?? null,
        latestApplicationRequestedAmount: latestApp?.requestedAmount ? Number(latestApp.requestedAmount) : null,
        latestLan: mostRecentLoan?.lan ?? null,
        latestLoanId: mostRecentLoan?.id?.toString() ?? null,
        latestLoanStatus: mostRecentLoan?.status ?? null,
        latestDisbursalStatus: mostRecentLoan?.disbursalStatus ?? null,
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
        // Allocation details from latest app
        allocatedLenderId: latestApp?.lenderId ?? null,
        allocatedLenderCode: latestApp?.lenderCode ?? null,
        allocatedLenderName: allocatedLenderName,
        assessmentFee: latestApp?.assessmentFeeTotalAmount ? {
          baseAmount: latestApp.assessmentFeeBaseAmount ? Number(latestApp.assessmentFeeBaseAmount) : null,
          gstRate: latestApp.assessmentFeeGstRate ? Number(latestApp.assessmentFeeGstRate) : null,
          gstAmount: latestApp.assessmentFeeGstAmount ? Number(latestApp.assessmentFeeGstAmount) : null,
          totalAmount: Number(latestApp.assessmentFeeTotalAmount),
          currency: latestApp.assessmentFeeCurrency
        } : null,
        journey: latestApp ? {
          applicationId: latestApp.id.toString(),
          applicationReference: latestApp.applicationNumber,
          applicationStatus: latestApp.status,
          platformLan: latestApp.platformLan,
          lenderApprovedAmount: latestApp.lenderApprovedAmount ? Number(latestApp.lenderApprovedAmount) : null,
          platformBreResult: latestApp.platformDecisionOutcome,
          allocatedLender: latestApp.lenderId ? { id: latestApp.lenderId, code: latestApp.lenderCode, name: allocatedLenderName, productId: latestApp.lenderProductId, productStrategyVersionId: latestApp.productStrategyVersionId } : null,
          assessmentFee: { paid: Boolean(latestSuccessPayment), paymentStatus: latestSuccessPayment?.status ?? null, paidAt: latestSuccessPayment?.paidAt ?? null },
          createStatus: link?.createStatus ?? 'NOT_STARTED',
          updateReadiness,
          updateStatus: link?.updateStatus ?? 'NOT_STARTED',
          decisionStatus: link?.decisionStatus ?? 'NOT_STARTED',
          normalizedDecision: link?.normalizedDecision ?? null,
          partnerReference: link?.partnerReference ?? null,
          coolingOffUntil: latestApp.lenderCoolingOffUntil,
          nextStatusCheckAt: latestApp.lenderNextStatusCheckAt,
          integration: currentOutbox ? { stage: currentOutbox.integrationStage, status: currentOutbox.status, attemptCount: currentOutbox.attemptCount, safeErrorCode: currentOutbox.lastErrorCode } : null,
          aaCompleted,
          aaStatus,
          nextPermittedStep,
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

  async resumeApplication(
    customerId: bigint,
    body: { platformProductId?: string; scopeCode?: string },
  ) {
    let platformProductId = body.platformProductId || null;
    if (!platformProductId) {
      const defaultPolicy = await this.prisma.platformPolicy.findFirst({
        where: { operationalStatus: 'ACTIVE' },
        orderBy: { createdAt: 'asc' }
      });
      if (defaultPolicy) {
        platformProductId = defaultPolicy.platformProductId;
      }
    }
    if (!platformProductId) {
      throw new BadRequestException('Platform product ID must be provided or configured by default.');
    }

    const application = await this.applicationTransitionService.createOrResumeApplication(
      customerId,
      platformProductId,
      body.scopeCode || 'PLATFORM_DEFAULT'
    );

    // Update customer's latest application ID
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { latestApplicationId: application.id }
    });

    return {
      success: true,
      data: {
        applicationId: application.id.toString(),
        applicationNumber: application.applicationNumber,
        status: application.status,
      }
    };
  }

  async submitApplication(customerId: bigint, body: any) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const isAadhaarVerified = Boolean(
      customer.aadhaarVerified ||
      customer.digilockerStatus === 'VERIFIED' ||
      customer.aadhaarKycStatus === 'VERIFIED'
    );

    if (!isAadhaarVerified) {
      throw new BadRequestException(
        'Aadhaar KYC through DigiLocker must be completed before lender submission.',
      );
    }

    const application = await this.applicationTransitionService.submitCanonicalApplication(customerId);
    const readiness = await this.lenderIntegrationOutbox.enqueueUpdateWhenReady(application.id);

    const updatedCustomer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        latestApplicationId: application.id,
        onboardingStatus: CustomerOnboardingStatus.APPLICATION_SUBMITTED,
        profileCompletedAt: customer.profileCompletedAt || new Date(),
        lastActivityAt: new Date(),
      },
    });

    this.logger.log(`Application ${application.applicationNumber} submitted for customer ${customer.customerCode}.`);

    return {
      success: true,
      message: 'Application submitted successfully for final approval.',
      data: {
        customerId: customer.id.toString(),
        customerCode: customer.customerCode,
        applicationNumber: application.applicationNumber,
        applicationId: application.id.toString(),
        status: 'APPLICATION_SUBMITTED',
        statusLabel: 'Under Final Approval',
        submittedAt: application.submittedAt?.toISOString(),
        estimatedReviewTimeHours: 24,
        updateReadiness: readiness.readiness,
        customer: this.serializeCustomer(updatedCustomer),
      },
    };
  }

  async simulateLenderApproval(customerId: bigint, body: any) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException('Route not found.');
    }
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

  async runEligibility(customerId: bigint, body: any) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Derive customer identity & verify ownership
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        include: { applications: { orderBy: { id: 'desc' }, take: 1 } }
      });

      if (!customer) throw new NotFoundException('Customer not found.');

      // 2. Resolve existing application
      let application;
      if (body?.applicationId) {
        application = await tx.plApplication.findUnique({ where: { id: BigInt(body.applicationId) } }) as any;
        if (!application) throw new NotFoundException('Application not found');
        if (application.customerId !== customerId) {
          throw new ForbiddenException('Application ownership verification failed');
        }
      } else {
        application = await tx.plApplication.findFirst({
          where: {
            customerId,
            status: { in: ['DRAFT', 'SUBMITTED', 'ALLOCATION_PENDING', 'LENDER_ALLOCATED', 'LENDER_REVIEW'] }
          },
          orderBy: { id: 'desc' }
        }) as any;

        if (!application) {
          throw new BadRequestException('No active application found to run eligibility.');
        }
      }

      // If already PASS and LENDER_ALLOCATED, return idempotent response
      if (application.status === 'LENDER_ALLOCATED' && application.platformDecisionOutcome === 'PASS') {
        return {
          success: true,
          message: 'Eligibility already passed.',
          data: {
            outcome: 'PASS',
            lenderId: application.lenderId,
            lenderProductId: application.lenderProductId,
            applicationNumber: application.applicationNumber,
            assessmentFee: {
              baseAmount: application.assessmentFeeBaseAmount ? application.assessmentFeeBaseAmount.toNumber() : null,
              gstRate: application.assessmentFeeGstRate ? application.assessmentFeeGstRate.toNumber() : null,
              gstAmount: application.assessmentFeeGstAmount ? application.assessmentFeeGstAmount.toNumber() : null,
              totalAmount: application.assessmentFeeTotalAmount ? application.assessmentFeeTotalAmount.toNumber() : null,
              currency: application.assessmentFeeCurrency
            }
          }
        };
      }

      // 3. Resolve ACTIVE Platform Eligibility Policy
      if (!application.platformProductId) {
        throw new BadRequestException('Canonical application is missing platformProductId.');
      }

      const policyVersion = await this.platformPoliciesService.resolveActivePolicyVersion(
        application.platformProductId,
        application.scopeCode,
        tx
      );

      // Requested amount is intentionally not part of the current customer flow.
      // Keep the persisted column for future use, but do not run amount-based BRE rules.
      const eligibilityRules = policyVersion.rules.filter(
        (r: any) => r.inputKey !== 'requestedAmount',
      );
      const activeRules = eligibilityRules.filter((r: any) => r.isActive);
      const requiredKeys = new Set(activeRules.map((r: any) => r.inputKey));

      // 4. Build dynamic inputs
      const inputs: Record<string, any> = {};

      if (requiredKeys.has('dateOfBirth')) inputs.dateOfBirth = customer.dateOfBirth ? customer.dateOfBirth.toISOString() : null;
      if (requiredKeys.has('isPanVerified')) inputs.isPanVerified = customer.panVerified;
      if (requiredKeys.has('residentialPincode')) inputs.residentialPincode = customer.residentialPincode;

      // Alias declaredMonthlyIncome to monthlyIncome
      if (requiredKeys.has('declaredMonthlyIncome')) {
        inputs.declaredMonthlyIncome = customer.monthlyIncome ? Number(customer.monthlyIncome) : null;
      }

      if (requiredKeys.has('hasActiveApplication')) {
        const activeAppCount = await tx.plApplication.count({
          where: {
            customerId,
            id: { not: application.id },
            status: { in: ACTIVE_APPLICATION_STATUSES }
          }
        });
        inputs.hasActiveApplication = activeAppCount > 0;
      }

      if (requiredKeys.has('hasFraudFlag')) {
        // No persisted fraud source exists. Return null to trigger controlled missing input error.
        inputs.hasFraudFlag = null;
      }

      if (requiredKeys.has('activeLoanCount')) {
        const activeLoans = await tx.plLoan.count({
          where: {
            customerId,
            status: 'DISBURSED'
          }
        });
        inputs.activeLoanCount = activeLoans;
      }

      if (requiredKeys.has('daysSinceLastRejection')) {
        const lastRejection = await tx.plApplication.findFirst({
          where: {
            customerId,
            status: { in: ['PLATFORM_REJECTED', 'LENDER_REJECTED'] }
          },
          orderBy: { updatedAt: 'desc' }
        });

        if (lastRejection) {
          const decisionTimestamp = lastRejection.status === 'PLATFORM_REJECTED'
            ? lastRejection.platformDecisionAt
            : lastRejection.lenderDecisionAt;

          if (!decisionTimestamp) {
            throw new Error(`Cooling-off calculation failed: Missing authoritative rejection timestamp for ${lastRejection.status}.`);
          }
          const diffTime = Math.abs(new Date().getTime() - decisionTimestamp.getTime());
          inputs.daysSinceLastRejection = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } else {
          // PASS (no rejection) - the explicit absence of a prior rejection is represented by null
          inputs.daysSinceLastRejection = null;
        }
      }

      if (requiredKeys.has('employmentVintageMonths')) {
        // No safe parsing available for freeform string.
        inputs.employmentVintageMonths = null;
      }

      if (requiredKeys.has('internalOverdueAmount')) {
        // Without an internal installment ledger, overdue is 0
        inputs.internalOverdueAmount = 0;
      }

      // 5. Evaluate policy
      let evalResult;
      try {
        evalResult = this.policyEvaluationService.evaluate(eligibilityRules, inputs);
      } catch (err: any) {
        this.logger.error(`BRE Technical Error: ${err.message}`, err.stack);
        throw new BadRequestException(`Eligibility Check Failed: ${err.message}`);
      }

      if (evalResult.finalOutcome === 'POLICY_INPUT_MISSING') {
        const missingRules = evalResult.ruleResults
          .filter((r: any) => r.outcome === 'POLICY_INPUT_MISSING')
          .map((r: any) => r.ruleName || r.ruleCode)
          .join(', ');
        throw new BadRequestException(`Missing required inputs for eligibility check. Missing data for: ${missingRules}`);
      }

      // 6. Handle Binary Outcome
      const isPass = evalResult.finalOutcome === PolicyDecisionOutcome.PASS;

      const updatedData: any = {
        platformDecisionOutcome: evalResult.finalOutcome,
        platformPolicyVersionId: policyVersion.id,
        platformEvaluationReference: `EVAL-${application.applicationNumber}-${Date.now()}`,
        status: isPass ? PlApplicationStatus.ALLOCATION_PENDING : PlApplicationStatus.PLATFORM_REJECTED
      };

      if (!isPass) {
        updatedData.platformDecisionAt = new Date();
      }

      let updatedApp = await tx.plApplication.update({
        where: { id: application.id },
        data: updatedData
      });

      let failReason = 'Platform policy rejection';
      if (!isPass && evalResult.ruleResults) {
        const failedRules = evalResult.ruleResults
          .filter((r: any) => r.outcome === 'FAIL' || r.outcome === 'REFER')
          .map((r: any) => r.ruleCode || r.ruleName)
          .join(', ');
        if (failedRules) {
          failReason = `Failed rules: ${failedRules}`;
        }
      }

      await tx.customer.update({
        where: { id: customerId },
        data: {
          eligibilityStatus: isPass ? CustomerEligibilityStatus.ELIGIBLE : CustomerEligibilityStatus.INELIGIBLE,
          eligibilityReason: isPass ? 'Meets all criteria' : failReason,
          eligibilityCheckedAt: new Date(),
          onboardingStatus: isPass ? CustomerOnboardingStatus.PLATFORM_ELIGIBLE : CustomerOnboardingStatus.PLATFORM_INELIGIBLE
        }
      });

      if (!isPass) {
        return { outcome: 'FAIL' };
      }

      // 7. Invoke MLM Allocation
      try {
        // Repeat-customer detection: a customer with a prior DISBURSED/FULLY_PAID loan
        // should be routed back to that exact lender+product whenever it's still eligible,
        // not put through a fresh round-robin draw — see mlm-allocation-engine.service.ts's
        // stickyRouteHint handling.
        const previousLoan = await tx.plLoan.findFirst({
          where: { customerId, status: { in: ['DISBURSED', 'FULLY_PAID'] } },
          orderBy: { id: 'desc' },
          include: { application: { select: { lenderId: true, lenderProductId: true } } },
        });
        const isRepeatCustomer = Boolean(previousLoan);
        const previousLenderId = previousLoan?.application?.lenderId ?? null;
        const previousLenderProductId = previousLoan?.application?.lenderProductId ?? null;

        const activeMlmPolicies = await tx.mlmPolicy.findMany({
          where: { platformProductId: application.platformProductId, operationalStatus: 'ACTIVE' },
          include: { versions: { where: { status: 'ACTIVE' }, include: { routes: { include: { routeState: true } } } } }
        });

        if (activeMlmPolicies.length === 1 && activeMlmPolicies[0].versions.length === 1) {
          const mlmVersion = activeMlmPolicies[0].versions[0];
          const mlmDto = {
            applicationReference: application.applicationNumber,
            requestedAmount: application.requestedAmount == null
              ? null
              : Number(application.requestedAmount),
            platformDecisionOutcome: 'PASS',
            platformProductId: application.platformProductId,
            customerSegment: (isRepeatCustomer ? 'REPEAT' : 'NEW') as 'REPEAT' | 'NEW',
            stickyRouteHint: isRepeatCustomer && previousLenderId && previousLenderProductId
              ? { lenderId: previousLenderId, productId: previousLenderProductId }
              : null,
          };

            const allocationDecision = await this.mlmAllocationEngineService.executeWithTx(tx, mlmDto, mlmVersion as any);

            if (allocationDecision && allocationDecision.status === 'ASSIGNED') {
               const decision = allocationDecision;
               if (!decision.productVersionId) {
                 throw new BadRequestException('MLM allocation is missing its Product Strategy Version snapshot.');
               }
               const productVersion = await tx.lenderProductVersion.findUnique({
                 where: { id: decision.productVersionId },
                 include: { multipliers: true, tenures: { orderBy: { sortOrder: 'asc' } } },
               });
               if (!productVersion || productVersion.productId !== decision.productId) {
                 throw new BadRequestException('MLM Product Strategy Version does not match the allocated lender product.');
               }

               const baseAmount = productVersion?.assessmentFeeAmount ? new Prisma.Decimal(productVersion.assessmentFeeAmount) : new Prisma.Decimal(0);
               const gstRate = productVersion?.assessmentFeeGstPercent ? new Prisma.Decimal(productVersion.assessmentFeeGstPercent) : new Prisma.Decimal(18);
               const gstAmount = baseAmount.mul(gstRate).dividedBy(100);
               const totalAmount = baseAmount.add(gstAmount);

               // Deterministic initial amount/tenure requested from the lender at CREATE
               // time (spec section 1): reuse the same multiplier/rounding logic as every
               // other offer calculation, with no lender-approved cap yet (use the
               // product's own cap) and the lowest-sortOrder configured tenure.
               const validTenures = productVersion.tenures.map((t) => t.tenure);
               if (validTenures.length === 0) {
                 throw new BadRequestException('The allocated product has no configured tenure options.');
               }
               const completedLoans = await tx.plLoan.count({ where: { customerId, status: { in: ['DISBURSED', 'FULLY_PAID'] } } });
               const initialSimulation = this.productCalculationService.simulate(
                 completedLoans,
                 validTenures[0],
                 productVersion.maximumAmountCap.toString(),
                 productVersion as any,
                 productVersion.multipliers,
                 validTenures,
               );

               updatedApp = await tx.plApplication.update({
                  where: { id: application.id },
                  data: {
                     status: PlApplicationStatus.LENDER_ALLOCATED,
                     lenderCode: decision.lenderId, // Assuming lenderId is code, or fetch from Lender table
                     mlmAllocationDecisionId: decision.id,
                     mlmPolicyId: decision.policyId,
                     mlmPolicyVersionId: decision.policyVersionId,
                     lenderId: decision.lenderId,
                     lenderProductId: decision.productId,
                     productStrategyVersionId: decision.productVersionId,
                     allocatedAt: new Date(),
                     requestedAmount: new Prisma.Decimal(initialSimulation.finalPrincipalAmount),
                     requestedTenure: validTenures[0],
                     assessmentFeeBaseAmount: baseAmount,
                     assessmentFeeGstRate: gstRate,
                     assessmentFeeGstAmount: gstAmount,
                     assessmentFeeTotalAmount: totalAmount,
                     assessmentFeeCurrency: 'INR'
                  }
               });

               // Attempt to find lender code
               const lender = await tx.lender.findUnique({ where: { id: decision.lenderId! } });
               if (lender) {
                  await tx.plApplication.update({
                     where: { id: application.id },
                     data: { lenderCode: lender.code }
                  });
               }

               return {
                 outcome: 'PASS',
                 lenderId: decision.lenderId,
                 lenderProductId: decision.productId,
                 applicationNumber: application.applicationNumber,
                   assessmentFee: {
                     baseAmount: baseAmount.toNumber(),
                     gstRate: gstRate.toNumber(),
                     gstAmount: gstAmount.toNumber(),
                     totalAmount: totalAmount.toNumber(),
                     currency: 'INR'
                   }
               };
          }
        }
      } catch (err: any) {
        this.logger.error(`MLM Error: ${err.message}`, err.stack);
        this.logger.error(`MLM Full Error:`, JSON.stringify(err, Object.getOwnPropertyNames(err)));
        // Keep BRE as PASS, status as ALLOCATION_PENDING
        throw new BadRequestException('Eligibility passed but we could not allocate a lender at this moment. Please try again.');
      }

      // If we reach here, MLM didn't assign
      throw new BadRequestException('Eligibility passed but no lender route available. Please try again later.');

    });
  }

  private nextPermittedStep(input: { application: any; payment: any; link: any; outbox: any; updateReadiness: { ready: boolean; reasons: string[] }; loan: any; hasDecisionConsents: boolean; aaCompleted?: boolean }): string {
    const { application, payment, link, outbox, updateReadiness, loan, hasDecisionConsents, aaCompleted } = input;
    if (!application) return 'BASIC_DETAILS';
    // application.status (not link.normalizedDecision, which is shared across both
    // lender decision calls) is authoritative for which of the two approval stages
    // the application is in — see LenderDecisionProcessor.process().
    if (application.status === 'LENDER_APPROVED') return loan ? 'BANK_DETAILS' : 'APPROVAL_PROCESSING';
    if (application.status === 'LENDER_REJECTED') return 'LENDER_REJECTED';
    // Once the customer has selected an offer, selectedAmount is set but status stays
    // LENDER_PRE_APPROVED until the final decision resolves — show "processing" instead
    // of sending them back to the offer picker they already completed.
    if (application.status === 'LENDER_PRE_APPROVED') return application.selectedAmount ? 'APPROVAL_PROCESSING' : 'PRE_APPROVAL_OFFER_SELECTION';
    // "Final approval processing" — offer selected, second lender decision requested,
    // awaiting the async result (or a manual credit-review override).
    if (application.status === 'PENDING_CREDIT_REVIEW') return 'APPROVAL_PROCESSING';
    if (outbox?.status === 'FAILED') return 'INTEGRATION_SUPPORT';
    if (application.platformDecisionOutcome !== 'PASS') return application.status === 'PLATFORM_REJECTED' ? 'PLATFORM_REJECTED' : 'BASIC_DETAILS';
    if (!payment) return 'ASSESSMENT_FEE';
    if (updateReadiness.reasons.some((reason) => ['EMPLOYMENT_SNAPSHOT_MISSING', 'MONTHLY_INCOME_MISSING', 'SALARIED_DETAILS_INCOMPLETE', 'BUSINESS_DETAILS_INCOMPLETE', 'LIVENESS_NOT_VERIFIED'].includes(reason))) return 'PROFILE_DETAILS';
    if (updateReadiness.reasons.some((reason) => ['DIGILOCKER_KYC_NOT_VERIFIED', 'AADHAAR_VERIFIED_NAME_MISSING'].includes(reason))) return 'AADHAAR_KYC';
    if (updateReadiness.reasons.some((reason) => ['PERMANENT_ADDRESS_MISSING', 'CURRENT_ADDRESS_MISSING', 'SAME_ADDRESS_DECISION_MISSING'].includes(reason))) return 'ADDRESS_DETAILS';
    // After Aadhaar KYC & Address confirmation, prompt for Account Aggregator bank statement
    if (!aaCompleted) return 'ACCOUNT_AGGREGATOR';
    // The customer must explicitly consent to a lender decision request before we
    // proceed automatically in the background — without this, CREATE/UPDATE can
    // race ahead of the customer ever seeing the Submit Application screen.
    if (!hasDecisionConsents) return 'SUBMIT_APPLICATION';
    if (!link || !['ACKNOWLEDGED', 'COMPLETED'].includes(link.createStatus)) return 'LENDER_CREATE_PROCESSING';
    if (!['ACKNOWLEDGED', 'COMPLETED'].includes(link.updateStatus)) return 'LENDER_UPDATE_PROCESSING';
    if (link.normalizedDecision === 'PENDING' || !['ACKNOWLEDGED', 'COMPLETED'].includes(link.decisionStatus)) return 'LENDER_DECISION_PROCESSING';
    return 'LENDER_DECISION_PROCESSING';
  }

  async saveApplicationAddress(customerId: bigint, body: any) {
    const application = await this.prisma.plApplication.findFirst({ where: { customerId }, orderBy: { id: 'desc' } });
    if (!application) throw new BadRequestException('Canonical application was not found.');
    const addressType = String(body?.addressType || '').toUpperCase();
    if (!['PERMANENT', 'CURRENT'].includes(addressType)) throw new BadRequestException('Address type must be PERMANENT or CURRENT.');
    let permanentForApplication: any = null;
    if (addressType === 'CURRENT') {
      permanentForApplication = await this.prisma.applicationAddress.findUnique({ where: { applicationId_addressType: { applicationId: application.id, addressType: 'PERMANENT' } } });
      if (!permanentForApplication) {
        // Repeat customers reuse their Customer-level Aadhaar verification and never go
        // through DigiLocker again for a fresh application, so the side effect that
        // normally seeds this application's own PERMANENT row (customer-aadhaar-kyc
        // service's snapshotVerifiedApplicationKyc, triggered only by a live DigiLocker
        // callback) never runs here. Backfill it from their most recently verified
        // application instead of forcing a re-verification — needed both when they keep
        // the same address (copied into CURRENT below) and when they enter a different one
        // (PERMANENT_ADDRESS_MISSING must still clear for this application either way).
        const priorPermanent = await this.prisma.applicationAddress.findFirst({
          where: { addressType: 'PERMANENT', application: { customerId } },
          orderBy: { applicationId: 'desc' },
        });
        if (priorPermanent) {
          permanentForApplication = await this.prisma.applicationAddress.create({
            data: {
              applicationId: application.id,
              addressType: 'PERMANENT',
              source: priorPermanent.source,
              addressLine1: priorPermanent.addressLine1,
              addressLine2: priorPermanent.addressLine2,
              landmark: priorPermanent.landmark,
              locality: priorPermanent.locality,
              district: priorPermanent.district,
              city: priorPermanent.city,
              state: priorPermanent.state,
              country: priorPermanent.country,
              pincode: priorPermanent.pincode,
              sourceVerifiedAt: priorPermanent.sourceVerifiedAt,
            },
          });
        }
      }
      if (!permanentForApplication) {
        // First-time customers with no prior application to backfill from used to hit a
        // hard dead-end here if snapshotVerifiedApplicationKyc's webhook-time upsert had
        // been silently skipped (see that method's comment — historically required
        // house/careOf/co/street to be non-empty, which some real Aadhaar records don't
        // populate). That gate is fixed going forward, but a customer already stuck in
        // this exact state (Aadhaar verified, no PERMANENT row, no prior application)
        // still needs a way out — reconstruct one from the Customer-level fields that
        // ARE always saved unconditionally at verification time (see
        // customer-aadhaar-kyc.service.ts's processAndPersistVerifiedDetails).
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (customer?.residentialCity && customer?.residentialState && customer?.residentialPincode) {
          const kycRecord = await this.prisma.kycVerificationStatus.findUnique({ where: { customerId } });
          permanentForApplication = await this.prisma.applicationAddress.create({
            data: {
              applicationId: application.id,
              addressType: 'PERMANENT',
              source: 'DIGILOCKER',
              addressLine1: kycRecord?.aadhaarAddress?.trim() || 'Address as per Aadhaar',
              city: customer.residentialCity,
              state: customer.residentialState,
              country: 'India',
              pincode: customer.residentialPincode,
              sourceVerifiedAt: customer.aadhaarVerifiedAt || customer.digilockerVerifiedAt || new Date(),
            },
          });
        }
      }
    }

    let address = body;
    if (addressType === 'CURRENT' && body?.sameAsPermanent === true) {
      if (!permanentForApplication) throw new BadRequestException('Permanent address must be saved first.');
      address = { ...permanentForApplication, addressType: 'CURRENT', sameAsPermanent: true, source: permanentForApplication.source };
    }
    const required = ['addressLine1', 'city', 'state', 'pincode'];
    if (required.some((field) => !String(address?.[field] || '').trim()) || !/^[1-9][0-9]{5}$/.test(String(address.pincode))) throw new BadRequestException('Complete structured address details are required.');
    if (addressType === 'CURRENT' && typeof address.sameAsPermanent !== 'boolean') throw new BadRequestException('Same-as-permanent decision is required for current address.');
    const data = { source: address.source === 'DIGILOCKER' ? 'DIGILOCKER' as const : 'CUSTOMER' as const, addressLine1: String(address.addressLine1).trim(), addressLine2: address.addressLine2 ? String(address.addressLine2).trim() : null, landmark: address.landmark ? String(address.landmark).trim() : null, locality: address.locality ? String(address.locality).trim() : null, district: address.district ? String(address.district).trim() : null, city: String(address.city).trim(), state: String(address.state).trim(), country: String(address.country || 'India').trim(), pincode: String(address.pincode), sameAsPermanent: addressType === 'CURRENT' ? Boolean(address.sameAsPermanent) : null, sourceVerifiedAt: address.source === 'DIGILOCKER' ? new Date() : null };
    const saved = await this.prisma.applicationAddress.upsert({ where: { applicationId_addressType: { applicationId: application.id, addressType: addressType as any } }, create: { applicationId: application.id, addressType: addressType as any, ...data }, update: data });
    const update = await this.lenderIntegrationOutbox.enqueueUpdateWhenReady(application.id);
    return { success: true, data: { address: saved, updateReadiness: update.readiness } };
  }

  async acceptDecisionConsents(customerId: bigint, body: any, metadata: { ipAddress?: string; userAgent?: string }) {
    const application = await this.prisma.plApplication.findFirst({ where: { customerId }, orderBy: { id: 'desc' } });
    if (!application) throw new BadRequestException('Canonical application was not found.');
    const result = await this.lenderIntegrationOutbox.recordDecisionConsents({ customerId, applicationId: application.id, consents: Array.isArray(body?.consents) ? body.consents : [], ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
    return { success: true, data: { decisionEnqueued: result.enqueued, eventId: result.event?.id ?? null } };
  }

  async retryLenderSubmission(customerId: bigint, body: any) {
    const application = body?.applicationId
      ? await this.prisma.plApplication.findUnique({ where: { id: BigInt(body.applicationId) } })
      : await this.prisma.plApplication.findFirst({ where: { customerId }, orderBy: { id: 'desc' } });

    if (!application) throw new NotFoundException('No application found to retry.');
    if (application.customerId !== customerId) throw new ForbiddenException('Application ownership verification failed');

    const event = await this.prisma.lenderIntegrationOutbox.findFirst({
      where: { applicationId: application.id, status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
    });

    if (!event) {
      throw new BadRequestException('There is no failed lender submission to retry for this application.');
    }

    const cooldownMs = 60_000;
    const sinceLastAttempt = Date.now() - new Date(event.updatedAt).getTime();
    if (sinceLastAttempt < cooldownMs) {
      throw new BadRequestException(`Please wait ${Math.ceil((cooldownMs - sinceLastAttempt) / 1000)} seconds before retrying again.`);
    }

    await this.lenderIntegrationOutbox.replayFailedEvent(event.id);
    return { success: true, message: 'Your application has been resubmitted. This may take a moment.' };
  }

  private calculateCompletedYears(dobStr: string): number {
    const dob = new Date(dobStr);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
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
