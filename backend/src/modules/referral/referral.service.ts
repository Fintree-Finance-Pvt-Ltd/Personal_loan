import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  ReferralCampaignStatus,
  CustomerReferralStatus,
  CustomerBenefitStatus,
  ReferralRewardType,
  ReferralDiscountType,
  Prisma,
} from '@prisma/client';

export interface CreateCampaignDto {
  campaignName: string;
  rewardType?: ReferralRewardType;
  discountType?: ReferralDiscountType;
  discountValue: number;
  maxDiscountLimit: number;
  minReferralRequirement?: number;
  applicableLoanNumber?: number;
  validityDays?: number;
  status?: ReferralCampaignStatus;
}

export interface ReportFilterDto {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  customerQuery?: string;
  referralCode?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generates or fetches unique referral code for customer.
   * Format: FIN + customerId (e.g. Customer ID 10025 -> FIN10025)
   */
  getReferralCode(customerId: bigint | number): string {
    return `FIN${customerId.toString()}`;
  }

  /**
   * Builds customer referral share link.
   */
  getShareLink(referralCode: string): string {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    return `${frontendUrl}/customer/login?ref=${referralCode}`;
  }

  /**
   * Resolves customer ID from referral code string (e.g. FIN10025 -> 10025).
   */
  async findCustomerByReferralCode(code: string) {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();

    // Check pattern FIN<id>
    if (cleanCode.startsWith('FIN')) {
      const rawId = cleanCode.replace(/^FIN/, '');
      if (/^\d+$/.test(rawId)) {
        try {
          const cust = await this.prisma.customer.findUnique({
            where: { id: BigInt(rawId) },
            select: { id: true, fullName: true, mobileNumber: true, customerCode: true },
          });
          if (cust) return cust;
        } catch {
          // ignore parsing error
        }
      }
    }

    // Fallback: search by customer_code
    const custByCode = await this.prisma.customer.findFirst({
      where: { customerCode: cleanCode },
      select: { id: true, fullName: true, mobileNumber: true, customerCode: true },
    });

    return custByCode;
  }

  /**
   * Validates a referral code.
   */
  async validateReferralCode(code: string) {
    if (!code) {
      throw new BadRequestException('Referral code is required.');
    }
    const referrer = await this.findCustomerByReferralCode(code);
    if (!referrer) {
      return {
        valid: false,
        message: 'Invalid referral code.',
      };
    }

    const maskedName = referrer.fullName
      ? referrer.fullName.replace(/(?<=.{2}).(?=.*@|.*)/g, '*')
      : 'Existing Customer';

    return {
      valid: true,
      referralCode: code.toUpperCase(),
      referrerName: maskedName,
      message: 'Valid referral code.',
    };
  }

  /**
   * Records relationship when a new customer registers using a referral code.
   */
  async recordReferralRegistration(referredCustomerId: bigint, referralCode: string) {
    if (!referralCode || !referredCustomerId) return null;

    const cleanCode = referralCode.trim().toUpperCase();
    const referrer = await this.findCustomerByReferralCode(cleanCode);

    if (!referrer) {
      this.logger.warn(`Referral registration attempt with unknown code: ${cleanCode}`);
      return null;
    }

    // Rule: Cannot refer self
    if (referrer.id === referredCustomerId) {
      this.logger.warn(`Customer ${referredCustomerId} attempted self-referral.`);
      return null;
    }

    // Rule: One customer can only have one referrer
    const existingMapping = await this.prisma.customerReferralMapping.findUnique({
      where: { referredCustomerId },
    });

    if (existingMapping) {
      this.logger.log(`Customer ${referredCustomerId} already has referrer ${existingMapping.referrerCustomerId}`);
      return existingMapping;
    }

    // Create new mapping in PENDING status
    const mapping = await this.prisma.customerReferralMapping.create({
      data: {
        referrerCustomerId: referrer.id,
        referredCustomerId,
        referralCode: cleanCode,
        status: CustomerReferralStatus.PENDING,
      },
    });

    this.logger.log(`Recorded referral mapping: Referrer ${referrer.id} -> Referred ${referredCustomerId}`);
    return mapping;
  }

  /**
   * Milestone trigger: Called when a referred customer's loan reaches status DISBURSED.
   */
  async onLoanDisbursed(loan: { id: bigint; customerId: bigint; lan: string }) {
    try {
      const mapping = await this.prisma.customerReferralMapping.findUnique({
        where: { referredCustomerId: loan.customerId },
      });

      if (!mapping) {
        return; // Referred customer was not referred by anyone
      }

      if (mapping.status === CustomerReferralStatus.QUALIFIED) {
        this.logger.log(`Referral mapping ${mapping.id} already qualified.`);
        return;
      }

      // Update mapping to QUALIFIED
      await this.prisma.customerReferralMapping.update({
        where: { id: mapping.id },
        data: {
          status: CustomerReferralStatus.QUALIFIED,
          disbursedAt: new Date(),
        },
      });

      // Look up active campaign rules
      const activeCampaign = await this.prisma.referralCampaign.findFirst({
        where: { status: ReferralCampaignStatus.ACTIVE },
        orderBy: { createdAt: 'desc' },
      });

      const discountType = activeCampaign?.discountType || ReferralDiscountType.PERCENTAGE;
      const discountValue = activeCampaign?.discountValue ? Number(activeCampaign.discountValue) : 50;
      const maxDiscountLimit = activeCampaign?.maxDiscountLimit ? Number(activeCampaign.maxDiscountLimit) : 1000;
      const validityDays = activeCampaign?.validityDays || 90;

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + validityDays);

      // Create processing fee discount benefit for referring customer
      const benefit = await this.prisma.customerBenefit.create({
        data: {
          customerId: mapping.referrerCustomerId,
          campaignId: activeCampaign?.id || null,
          sourceReferralId: mapping.id,
          benefitType: ReferralRewardType.PROCESSING_FEE_DISCOUNT,
          discountType,
          discountValue: new Prisma.Decimal(discountValue),
          maxDiscountLimit: new Prisma.Decimal(maxDiscountLimit),
          status: CustomerBenefitStatus.AVAILABLE,
          expiryDate,
        },
      });

      this.logger.log(
        `Generated referral benefit ${benefit.id} for referrer ${mapping.referrerCustomerId} upon loan ${loan.lan} disbursal.`,
      );
    } catch (error: any) {
      this.logger.error(`Error processing loan disbursal referral: ${error?.message || error}`, error?.stack);
    }
  }

  /**
   * Gets available benefit for customer for an upcoming loan application.
   */
  async getAvailableBenefitForCustomer(customerId: bigint, loanNumber: number = 2) {
    const now = new Date();

    // Fetch active available benefits that haven't expired
    const benefits = await this.prisma.customerBenefit.findMany({
      where: {
        customerId,
        status: CustomerBenefitStatus.AVAILABLE,
        expiryDate: { gt: now },
      },
      include: {
        campaign: true,
      },
      orderBy: { expiryDate: 'asc' },
    });

    if (benefits.length === 0) return null;

    // Filter by campaign applicable loan number rule if applicable
    const eligibleBenefit = benefits.find((b) => {
      const minLoanNum = b.campaign?.applicableLoanNumber || 2;
      return loanNumber >= minLoanNum;
    }) || benefits[0]; // fallback to first active benefit if no campaign restriction

    return eligibleBenefit;
  }

  /**
   * Calculates discounted processing fee given base fee and customer ID.
   */
  async calculateDiscountedProcessingFee(customerId: bigint, baseFee: number, loanNumber: number = 2) {
    const benefit = await this.getAvailableBenefitForCustomer(customerId, loanNumber);
    if (!benefit) {
      return {
        originalProcessingFee: baseFee,
        discountApplied: 0,
        finalProcessingFee: baseFee,
        benefitApplied: false,
        benefitId: null,
      };
    }

    const discountVal = Number(benefit.discountValue);
    const maxLimit = Number(benefit.maxDiscountLimit);

    let calculatedDiscount = 0;
    if (benefit.discountType === ReferralDiscountType.PERCENTAGE) {
      calculatedDiscount = Math.round((baseFee * discountVal) / 100);
    } else {
      calculatedDiscount = discountVal;
    }

    const discountApplied = Math.min(calculatedDiscount, maxLimit, baseFee);
    const finalProcessingFee = Math.max(0, baseFee - discountApplied);

    return {
      originalProcessingFee: baseFee,
      discountApplied,
      finalProcessingFee,
      benefitApplied: true,
      benefitId: benefit.id.toString(),
      benefitDetails: {
        discountType: benefit.discountType,
        discountValue: discountVal,
        maxDiscountLimit: maxLimit,
      },
    };
  }

  /**
   * Consumes/applies a benefit upon loan booking/confirmation.
   */
  async applyBenefitToLoan(
    customerId: bigint,
    loanId: bigint | null,
    applicationId: bigint | null,
    originalProcessingFee: number,
    discountApplied: number,
    finalProcessingFee: number,
    benefitId: bigint,
  ) {
    const benefit = await this.prisma.customerBenefit.findUnique({
      where: { id: benefitId },
    });

    if (!benefit || benefit.status !== CustomerBenefitStatus.AVAILABLE) {
      throw new BadRequestException('Benefit is not available or already used.');
    }

    // 1. Record usage history
    const usage = await this.prisma.benefitUsageHistory.create({
      data: {
        benefitId,
        customerId,
        applicationId,
        loanId,
        originalProcessingFee: new Prisma.Decimal(originalProcessingFee),
        discountApplied: new Prisma.Decimal(discountApplied),
        finalProcessingFee: new Prisma.Decimal(finalProcessingFee),
      },
    });

    // 2. Mark benefit as USED
    await this.prisma.customerBenefit.update({
      where: { id: benefitId },
      data: { status: CustomerBenefitStatus.USED },
    });

    this.logger.log(`Benefit ${benefitId} marked as USED for loan ${loanId || applicationId}`);
    return usage;
  }

  /**
   * Gets Referral Dashboard summary for Customer Mobile App.
   */
  async getReferralDashboard(customerId: bigint) {
    const code = this.getReferralCode(customerId);
    const shareLink = this.getShareLink(code);

    const mappings = await this.prisma.customerReferralMapping.findMany({
      where: { referrerCustomerId: customerId },
      include: {
        referred: {
          select: {
            fullName: true,
            firstName: true,
            lastName: true,
            mobileNumber: true,
            loans: {
              select: { status: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalReferrals = mappings.length;
    const successfulReferrals = mappings.filter((m) => m.status === CustomerReferralStatus.QUALIFIED).length;

    const now = new Date();
    const availableBenefits = await this.prisma.customerBenefit.findMany({
      where: {
        customerId,
        status: CustomerBenefitStatus.AVAILABLE,
        expiryDate: { gt: now },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const availableDiscount = availableBenefits.reduce((acc, b) => {
      // Return max discount limit or value description
      return Math.max(acc, Number(b.maxDiscountLimit));
    }, 0);

    const usedUsages = await this.prisma.benefitUsageHistory.findMany({
      where: { customerId },
    });
    const usedDiscount = usedUsages.reduce((sum, u) => sum + Number(u.discountApplied), 0);

    const earliestExpiry = availableBenefits.length > 0 ? availableBenefits[0].expiryDate : null;

    const referralHistory = mappings.map((m) => {
      const refName = m.referred.fullName || `${m.referred.firstName || ''} ${m.referred.lastName || ''}`.trim() || 'Referred User';
      const maskedName = refName.replace(/(?<=.{2}).(?=.*@|.*)/g, '*');
      const latestLoan = m.referred.loans[0];
      const loanStatus = latestLoan ? latestLoan.status : m.status === CustomerReferralStatus.QUALIFIED ? 'DISBURSED' : 'REGISTERED';

      return {
        id: m.id.toString(),
        customerName: maskedName,
        referredAt: m.createdAt,
        disbursedAt: m.disbursedAt,
        loanStatus,
        referralStatus: m.status,
      };
    });

    return {
      referralCode: code,
      shareLink,
      totalReferrals,
      successfulReferrals,
      availableDiscount,
      usedDiscount,
      expiryDate: earliestExpiry,
      hasAvailableBenefit: availableBenefits.length > 0,
      availableBenefitsCount: availableBenefits.length,
      referralHistory,
    };
  }

  // ── WEB ADMIN MODULE METHODS ──────────────────────────────────────────────

  async getAdminCampaigns() {
    const campaigns = await this.prisma.referralCampaign.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return campaigns.map((c) => ({
      ...c,
      id: c.id.toString(),
      discountValue: Number(c.discountValue),
      maxDiscountLimit: Number(c.maxDiscountLimit),
    }));
  }

  async createCampaign(dto: CreateCampaignDto) {
    const campaign = await this.prisma.referralCampaign.create({
      data: {
        campaignName: dto.campaignName,
        rewardType: dto.rewardType || ReferralRewardType.PROCESSING_FEE_DISCOUNT,
        discountType: dto.discountType || ReferralDiscountType.PERCENTAGE,
        discountValue: new Prisma.Decimal(dto.discountValue),
        maxDiscountLimit: new Prisma.Decimal(dto.maxDiscountLimit),
        minReferralRequirement: dto.minReferralRequirement ?? 1,
        applicableLoanNumber: dto.applicableLoanNumber ?? 2,
        validityDays: dto.validityDays ?? 90,
        status: dto.status || ReferralCampaignStatus.ACTIVE,
      },
    });

    return { ...campaign, id: campaign.id.toString() };
  }

  async updateCampaign(id: string, dto: Partial<CreateCampaignDto>) {
    const campaignId = BigInt(id);
    const data: Prisma.ReferralCampaignUpdateInput = {};

    if (dto.campaignName !== undefined) data.campaignName = dto.campaignName;
    if (dto.rewardType !== undefined) data.rewardType = dto.rewardType;
    if (dto.discountType !== undefined) data.discountType = dto.discountType;
    if (dto.discountValue !== undefined) data.discountValue = new Prisma.Decimal(dto.discountValue);
    if (dto.maxDiscountLimit !== undefined) data.maxDiscountLimit = new Prisma.Decimal(dto.maxDiscountLimit);
    if (dto.minReferralRequirement !== undefined) data.minReferralRequirement = dto.minReferralRequirement;
    if (dto.applicableLoanNumber !== undefined) data.applicableLoanNumber = dto.applicableLoanNumber;
    if (dto.validityDays !== undefined) data.validityDays = dto.validityDays;
    if (dto.status !== undefined) data.status = dto.status;

    const updated = await this.prisma.referralCampaign.update({
      where: { id: campaignId },
      data,
    });

    return { ...updated, id: updated.id.toString() };
  }

  async getReferralReports(filters: ReportFilterDto) {
    const page = Number(filters.page || 1);
    const limit = Number(filters.limit || 20);
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerReferralMappingWhereInput = {};

    if (filters.status) {
      where.status = filters.status as CustomerReferralStatus;
    }

    if (filters.referralCode) {
      where.referralCode = { contains: filters.referralCode.trim().toUpperCase() };
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    if (filters.customerQuery) {
      const query = filters.customerQuery.trim();
      where.OR = [
        { referrer: { fullName: { contains: query } } },
        { referrer: { mobileNumber: { contains: query } } },
        { referred: { fullName: { contains: query } } },
        { referred: { mobileNumber: { contains: query } } },
      ];
    }

    const [total, mappings] = await Promise.all([
      this.prisma.customerReferralMapping.count({ where }),
      this.prisma.customerReferralMapping.findMany({
        where,
        skip,
        take: limit,
        include: {
          referrer: {
            select: { id: true, fullName: true, mobileNumber: true, customerCode: true },
          },
          referred: {
            select: {
              id: true,
              fullName: true,
              mobileNumber: true,
              customerCode: true,
              loans: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
            },
          },
          benefits: {
            include: { usageHistory: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const data = mappings.map((m) => {
      const benefit = m.benefits[0];
      const usage = benefit?.usageHistory[0];
      const latestLoan = m.referred.loans[0];

      return {
        id: m.id.toString(),
        referrerName: m.referrer.fullName || '—',
        referrerMobile: m.referrer.mobileNumber || '—',
        referralCode: m.referralCode,
        referredName: m.referred.fullName || '—',
        referredMobile: m.referred.mobileNumber || '—',
        loanStatus: latestLoan ? latestLoan.status : m.status === CustomerReferralStatus.QUALIFIED ? 'DISBURSED' : 'REGISTERED',
        referralStatus: m.status,
        benefitGenerated: benefit ? `₹${Number(benefit.maxDiscountLimit)} Discount` : 'None',
        benefitUsed: usage ? `₹${Number(usage.discountApplied)}` : 'No',
        expiryDate: benefit?.expiryDate || null,
        createdAt: m.createdAt,
      };
    });

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
    };
  }

  async exportReferralReportsCsv(filters: ReportFilterDto) {
    const reports = await this.getReferralReports({ ...filters, limit: 10000, page: 1 });
    const rows = reports.data;

    const headers = [
      'Referrer Name',
      'Referrer Mobile',
      'Referral Code',
      'Referred Customer',
      'Referred Mobile',
      'Loan Status',
      'Referral Status',
      'Benefit Generated',
      'Benefit Used',
      'Expiry Date',
      'Date Registered',
    ];

    const csvLines = [headers.join(',')];
    for (const r of rows) {
      const line = [
        `"${r.referrerName}"`,
        `"${r.referrerMobile}"`,
        `"${r.referralCode}"`,
        `"${r.referredName}"`,
        `"${r.referredMobile}"`,
        `"${r.loanStatus}"`,
        `"${r.referralStatus}"`,
        `"${r.benefitGenerated}"`,
        `"${r.benefitUsed}"`,
        `"${r.expiryDate ? new Date(r.expiryDate).toISOString().split('T')[0] : '—'}"`,
        `"${new Date(r.createdAt).toISOString().split('T')[0]}"`,
      ].join(',');
      csvLines.push(line);
    }

    return csvLines.join('\n');
  }

  async getAdminBenefits(filters: { customerId?: string; status?: string; page?: number; limit?: number }) {
    const page = Number(filters.page || 1);
    const limit = Number(filters.limit || 20);
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerBenefitWhereInput = {};
    if (filters.customerId) where.customerId = BigInt(filters.customerId);
    if (filters.status) where.status = filters.status as CustomerBenefitStatus;

    const [total, benefits] = await Promise.all([
      this.prisma.customerBenefit.count({ where }),
      this.prisma.customerBenefit.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: { select: { id: true, fullName: true, mobileNumber: true } },
          usageHistory: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: benefits.map((b) => ({
        id: b.id.toString(),
        customerId: b.customerId.toString(),
        customerName: b.customer.fullName || '—',
        customerMobile: b.customer.mobileNumber || '—',
        benefitType: b.benefitType,
        discountType: b.discountType,
        discountValue: Number(b.discountValue),
        maxDiscountLimit: Number(b.maxDiscountLimit),
        status: b.status,
        expiryDate: b.expiryDate,
        createdAt: b.createdAt,
        usage: b.usageHistory[0]
          ? {
              originalProcessingFee: Number(b.usageHistory[0].originalProcessingFee),
              discountApplied: Number(b.usageHistory[0].discountApplied),
              finalProcessingFee: Number(b.usageHistory[0].finalProcessingFee),
              usedAt: b.usageHistory[0].usedAt,
            }
          : null,
      })),
    };
  }

  async adjustAdminBenefit(
    id: string,
    dto: { status?: CustomerBenefitStatus; maxDiscountLimit?: number; expiryDate?: string },
  ) {
    const benefitId = BigInt(id);
    const data: Prisma.CustomerBenefitUpdateInput = {};

    if (dto.status) data.status = dto.status;
    if (dto.maxDiscountLimit !== undefined) data.maxDiscountLimit = new Prisma.Decimal(dto.maxDiscountLimit);
    if (dto.expiryDate) data.expiryDate = new Date(dto.expiryDate);

    const updated = await this.prisma.customerBenefit.update({
      where: { id: benefitId },
      data,
    });

    return { ...updated, id: updated.id.toString() };
  }
}
