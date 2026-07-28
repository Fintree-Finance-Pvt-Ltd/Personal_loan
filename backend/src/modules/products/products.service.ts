import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ProductCalculationService, AmountConfig } from './product-calculation.service';
import { Prisma, ProductOperationalStatus, ProductVersionStatus } from '@prisma/client';
import { z } from 'zod';
import {
  createProductSchema,
  updateProductIdentitySchema,
  updateProductStrategySchema,
  rejectProductVersionSchema,
  productQuerySchema,
} from './products.validation';

type AuthContext = {
  actorUserId: string;
  actorRoleCodes: string[];
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
    private readonly calc: ProductCalculationService,
  ) {}

  private async auditLog(action: string, productId: string, outcome: 'SUCCESS' | 'FAILURE', previousValue: any, newValue: any, context: AuthContext) {
    await this.audit.record({
      action,
      actorUserId: context.actorUserId,
      actorRoleCodes: context.actorRoleCodes,
      module: 'PRODUCT',
      entityType: 'LenderProduct',
      entityId: productId,
      outcome,
      previousValue,
      newValue,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async createProduct(input: z.infer<typeof createProductSchema>, ctx: AuthContext) {
    const lender = await this.prisma.lender.findUnique({ where: { id: input.lenderId } });
    if (!lender) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Lender not found' } });
    if (lender.approvalStatus !== 'APPROVED') {
      throw new BadRequestException({ error: { code: 'INVALID_STATE', message: 'Product can only be created for APPROVED lenders.' } });
    }

    const platformProduct = await this.prisma.platformProduct.findUnique({ where: { id: input.platformProductId } });
    if (!platformProduct) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Platform Product not found' } });
    if (platformProduct.status !== 'ACTIVE') {
      throw new BadRequestException({ error: { code: 'INVALID_STATE', message: 'Platform Product is not active' } });
    }

    const finalCode = input.code || platformProduct.code;
    const finalName = input.name || platformProduct.name;
    const finalDescription = input.description || platformProduct.description;

    const existingCode = await this.prisma.lenderProduct.findUnique({
      where: { lenderId_code: { lenderId: input.lenderId, code: finalCode } },
    });
    if (existingCode) {
      throw new ConflictException({ error: { code: 'CONFLICT', message: 'Product code must be unique within the lender.' } });
    }

    this.calc.validateAmounts(input.strategy);
    this.calc.validateMultipliers(input.strategy.multipliers);



    const result = await this.prisma.$transaction(async (tx: any) => {
      const product = await tx.lenderProduct.create({
        data: {
          lenderId: input.lenderId,
          platformProductId: input.platformProductId,
          name: finalName,
          code: finalCode,
          description: finalDescription,
          operationalStatus: ProductOperationalStatus.INACTIVE,
          createdById: ctx.actorUserId,
          updatedById: ctx.actorUserId,
          versions: {
            create: {
              versionNumber: 1,
              status: ProductVersionStatus.DRAFT,
              minimumAmount: input.strategy.minimumAmount,
              firstLoanBaseAmount: input.strategy.firstLoanBaseAmount,
              maximumAmountCap: input.strategy.maximumAmountCap,
              repeatTierScope: input.strategy.repeatTierScope,
              roundingMethod: input.strategy.roundingMethod,
              roundingUnit: input.strategy.roundingUnit,
              interestMethod: input.strategy.interestMethod,
              annualRoiPercent: input.strategy.annualRoiPercent,
              processingFeePercent: input.strategy.processingFeePercent,
              processingFeeGstPercent: input.strategy.processingFeeGstPercent,
              assessmentFeeAmount: input.strategy.assessmentFeeAmount,
              assessmentFeeGstPercent: input.strategy.assessmentFeeGstPercent,
              penalChargeAmount: input.strategy.penalChargeAmount,
              bounceChargeAmount: input.strategy.bounceChargeAmount,
              emiDueDay: input.strategy.emiDueDay,
              includeAssessmentFeeInApr: input.strategy.includeAssessmentFeeInApr,
              tenureType: input.strategy.tenureType,
              effectiveFrom: input.strategy.effectiveFrom,
              createdById: ctx.actorUserId,
              updatedById: ctx.actorUserId,
              multipliers: {
                create: input.strategy.multipliers.map((m: any, index: number) => ({
                  minimumCompletedLoans: m.minimumCompletedLoans,
                  multiplier: m.multiplier,
                  sortOrder: index,
                })),
              },
              tenures: {
                create: input.strategy.tenures.map((t: number, index: number) => ({
                  tenure: t,
                  sortOrder: index,
                })),
              },
            },
          },
        },
        include: { versions: { include: { multipliers: true, tenures: true } } },
      });
      return product;
    });

    await this.auditLog('PRODUCT_CREATED', result.id, 'SUCCESS', null, { code: result.code, name: result.name }, ctx);
    return result;
  }

  async getProducts(query: z.infer<typeof productQuerySchema>) {
    const where: Prisma.LenderProductWhereInput = {};
    if (query.lenderId) where.lenderId = query.lenderId;
    if (query.operationalStatus) where.operationalStatus = query.operationalStatus;
    if (query.versionStatus) where.versions = { some: { status: query.versionStatus } };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { code: { contains: query.search } },
        { lender: { legalName: { contains: query.search } } },
        { lender: { displayName: { contains: query.search } } },
        { lender: { code: { contains: query.search } } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [total, items] = await Promise.all([
      this.prisma.lenderProduct.count({ where }),
      this.prisma.lenderProduct.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          lender: { select: { id: true, legalName: true, displayName: true, code: true } },
          versions: {
            orderBy: { versionNumber: 'desc' },
            select: {
              id: true,
              versionNumber: true,
              status: true,
              firstLoanBaseAmount: true,
              maximumAmountCap: true,
            },
          },
          _count: { select: { versions: true } },
        },
      }),
    ]);

    return {
      total,
      page: query.page,
      limit: query.limit,
      items: items.map((item: any) => {
        const activeVersion = item.versions.find((v: any) => v.status === ProductVersionStatus.ACTIVE) || null;
        let latestVersion = item.versions[0] || null;
        if (latestVersion && activeVersion && latestVersion.versionNumber < activeVersion.versionNumber) {
          latestVersion = activeVersion;
        }
        return {
          id: item.id,
          name: item.name,
          code: item.code,
          description: item.description,
          operationalStatus: item.operationalStatus,
          lender: item.lender,
          activeVersion,
          latestVersion: {
            id: latestVersion?.id,
            versionNumber: latestVersion?.versionNumber,
            status: latestVersion?.status,
          },
          versionCount: item._count.versions,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      }),
    };
  }

  async getProduct(productId: string) {
    const product = await this.prisma.lenderProduct.findUnique({
      where: { id: productId },
      include: {
        lender: { select: { id: true, legalName: true, displayName: true, code: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            multipliers: { orderBy: { sortOrder: 'asc' } },
            tenures: { orderBy: { sortOrder: 'asc' } },
            createdBy: { select: { id: true, name: true, email: true } },
            updatedBy: { select: { id: true, name: true, email: true } },
            submittedBy: { select: { id: true, name: true, email: true } },
            approvedBy: { select: { id: true, name: true, email: true } },
            rejectedBy: { select: { id: true, name: true, email: true } },
            activatedBy: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Product not found.' } });
    return product;
  }

  async updateProductIdentity(productId: string, input: z.infer<typeof updateProductIdentitySchema>, ctx: AuthContext) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'No fields provided for update.' } });
    }
    const product = await this.getProduct(productId);
    const updated = await this.prisma.lenderProduct.update({
      where: { id: productId },
      data: {
        ...input,
        updatedById: ctx.actorUserId,
      },
    });
    await this.auditLog('PRODUCT_UPDATED', productId, 'SUCCESS', { name: product.name, description: product.description }, input, ctx);
    return updated;
  }

  async updateProductStatus(productId: string, status: ProductOperationalStatus, ctx: AuthContext) {
    const product = await this.getProduct(productId);
    if (product.operationalStatus === status) return product;

    const updated = await this.prisma.lenderProduct.update({
      where: { id: productId },
      data: {
        operationalStatus: status,
        updatedById: ctx.actorUserId,
      },
    });

    await this.auditLog('PRODUCT_STATUS_UPDATED', productId, 'SUCCESS', { operationalStatus: product.operationalStatus }, { operationalStatus: status }, ctx);
    return updated;
  }

  async updateProductStrategy(versionId: string, input: z.infer<typeof updateProductStrategySchema>, ctx: AuthContext) {
    const version = await this.prisma.lenderProductVersion.findUnique({
      where: { id: versionId },
      include: { multipliers: true, tenures: true, product: true },
    });
    if (!version) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Version not found.' } });

    if (version.status !== ProductVersionStatus.DRAFT && version.status !== ProductVersionStatus.REJECTED) {
      throw new BadRequestException({ error: { code: 'INVALID_STATE', message: 'Only DRAFT or REJECTED versions can be edited.' } });
    }
    if (version.version !== input.expectedVersion) {
      throw new ConflictException({ error: { code: 'CONFLICT', message: 'The version has been modified since it was loaded. Please refresh.' } });
    }

    const { expectedVersion, tenures, multipliers, ...updates } = input;
    
    // Validate amounts
    this.calc.validateAmounts(updates);
    this.calc.validateMultipliers(multipliers);

    const updated = await this.prisma.$transaction(async (tx: any) => {
      // delete existing relations
      await tx.lenderOfferMultiplier.deleteMany({ where: { productVersionId: versionId } });
      await tx.lenderProductTenure.deleteMany({ where: { productVersionId: versionId } });

      return tx.lenderProductVersion.update({
        where: { id: versionId, version: input.expectedVersion },
        data: {
          ...updates,
          status: ProductVersionStatus.DRAFT,
          rejectedById: null,
          rejectedAt: null,
          rejectionReason: null,
          updatedById: ctx.actorUserId,
          version: { increment: 1 },
          multipliers: {
            create: multipliers.map((m: any, index: number) => ({
              minimumCompletedLoans: m.minimumCompletedLoans,
              multiplier: m.multiplier,
              sortOrder: index,
            })),
          },
          tenures: {
            create: tenures.map((t: number, index: number) => ({
              tenure: t,
              sortOrder: index,
            })),
          },
        },
        include: { multipliers: true, tenures: true },
      });
    });

    await this.auditLog('PRODUCT_STRATEGY_UPDATED', version.productId, 'SUCCESS', { versionId }, input, ctx);
    return updated;
  }

  async submitVersion(versionId: string, ctx: AuthContext) {
    const version = await this.prisma.lenderProductVersion.findUnique({
      where: { id: versionId },
      include: { multipliers: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!version) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Version not found.' } });
    if (version.status !== ProductVersionStatus.DRAFT) {
      throw new BadRequestException({ error: { code: 'INVALID_STATE', message: 'Only DRAFT versions can be submitted.' } });
    }

    this.calc.validateAmounts(version as any as AmountConfig);
    this.calc.validateMultipliers(version.multipliers);

    const updated = await this.prisma.lenderProductVersion.update({
      where: { id: versionId, status: ProductVersionStatus.DRAFT },
      data: {
        status: ProductVersionStatus.SUBMITTED,
        submittedById: ctx.actorUserId,
        submittedAt: new Date(),
        updatedById: ctx.actorUserId,
        version: { increment: 1 },
      },
    });

    await this.auditLog('PRODUCT_VERSION_SUBMITTED', version.productId, 'SUCCESS', { versionId }, null, ctx);
    return updated;
  }

  async approveVersion(versionId: string, ctx: AuthContext) {
    const version = await this.prisma.lenderProductVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Version not found.' } });
    if (version.status !== ProductVersionStatus.SUBMITTED) {
      throw new BadRequestException({ error: { code: 'INVALID_STATE', message: 'Only SUBMITTED versions can be approved.' } });
    }

    const makerId = version.submittedById || version.createdById;
    if (makerId === ctx.actorUserId) {
      throw new BadRequestException({ error: { code: 'SEGREGATION_OF_DUTIES', message: 'Maker cannot approve their own submitted version.' } });
    }

    const updated = await this.prisma.lenderProductVersion.update({
      where: { id: versionId, status: ProductVersionStatus.SUBMITTED },
      data: {
        status: ProductVersionStatus.APPROVED,
        approvedById: ctx.actorUserId,
        approvedAt: new Date(),
        updatedById: ctx.actorUserId,
        version: { increment: 1 },
      },
    });

    await this.auditLog('PRODUCT_VERSION_APPROVED', version.productId, 'SUCCESS', { versionId }, null, ctx);
    return updated;
  }

  async rejectVersion(versionId: string, input: z.infer<typeof rejectProductVersionSchema>, ctx: AuthContext) {
    const version = await this.prisma.lenderProductVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Version not found.' } });
    if (version.status !== ProductVersionStatus.SUBMITTED) {
      throw new BadRequestException({ error: { code: 'INVALID_STATE', message: 'Only SUBMITTED versions can be rejected.' } });
    }

    const makerId = version.submittedById || version.createdById;
    if (makerId === ctx.actorUserId) {
      throw new BadRequestException({ error: { code: 'SEGREGATION_OF_DUTIES', message: 'Maker cannot reject their own submitted version.' } });
    }

    const updated = await this.prisma.lenderProductVersion.update({
      where: { id: versionId, status: ProductVersionStatus.SUBMITTED },
      data: {
        status: ProductVersionStatus.REJECTED,
        rejectedById: ctx.actorUserId,
        rejectedAt: new Date(),
        rejectionReason: input.reason,
        updatedById: ctx.actorUserId,
        version: { increment: 1 },
      },
    });

    await this.auditLog('PRODUCT_VERSION_REJECTED', version.productId, 'SUCCESS', { versionId }, { reason: input.reason }, ctx);
    return updated;
  }

  async activateVersion(versionId: string, ctx: AuthContext) {
    const version = await this.prisma.lenderProductVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Version not found.' } });
    if (version.status === ProductVersionStatus.ACTIVE) return version; // Idempotent
    if (version.status !== ProductVersionStatus.APPROVED) {
      throw new BadRequestException({ error: { code: 'INVALID_STATE', message: 'Only APPROVED versions can be activated.' } });
    }

    const result = await this.prisma.$transaction(async (tx: any) => {
      const activeVersions = await tx.lenderProductVersion.findMany({
        where: { productId: version.productId, status: ProductVersionStatus.ACTIVE },
      });

      if (activeVersions.length > 0) {
        await tx.lenderProductVersion.updateMany({
          where: { id: { in: activeVersions.map((v: any) => v.id) } },
          data: { status: ProductVersionStatus.SUPERSEDED, updatedById: ctx.actorUserId },
        });
      }

      return tx.lenderProductVersion.update({
        where: { id: versionId, status: ProductVersionStatus.APPROVED },
        data: {
          status: ProductVersionStatus.ACTIVE,
          activatedById: ctx.actorUserId,
          activatedAt: new Date(),
          updatedById: ctx.actorUserId,
          version: { increment: 1 },
        },
      });
    });

    await this.auditLog('PRODUCT_VERSION_ACTIVATED', version.productId, 'SUCCESS', { versionId }, null, ctx);
    return result;
  }

  async createNextVersion(productId: string, ctx: AuthContext) {
    const product = await this.prisma.lenderProduct.findUnique({
      where: { id: productId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { 
            multipliers: { orderBy: { sortOrder: 'asc' } },
            tenures: { orderBy: { sortOrder: 'asc' } } 
          },
        },
      },
    });
    if (!product) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Product not found.' } });

    const draftOrSubmitted = product.versions.find((v: any) => v.status === ProductVersionStatus.DRAFT || v.status === ProductVersionStatus.SUBMITTED);
    if (draftOrSubmitted) {
      throw new ConflictException({ error: { code: 'CONFLICT', message: 'A DRAFT or SUBMITTED version already exists.' } });
    }

    const sourceVersion = product.versions.find((v: any) => v.status === ProductVersionStatus.ACTIVE)
                       || product.versions.find((v: any) => v.status === ProductVersionStatus.APPROVED)
                       || product.versions[0];

    if (!sourceVersion) {
      throw new BadRequestException({ error: { code: 'INVALID_STATE', message: 'No source version available to clone.' } });
    }

    const nextVersionNumber = product.versions[0].versionNumber + 1;

    const newVersion = await this.prisma.lenderProductVersion.create({
      data: {
        productId,
        versionNumber: nextVersionNumber,
        status: ProductVersionStatus.DRAFT,
        minimumAmount: sourceVersion.minimumAmount,
        firstLoanBaseAmount: sourceVersion.firstLoanBaseAmount,
        maximumAmountCap: sourceVersion.maximumAmountCap,
        repeatTierScope: sourceVersion.repeatTierScope,
        roundingMethod: sourceVersion.roundingMethod,
        roundingUnit: sourceVersion.roundingUnit,
        interestMethod: sourceVersion.interestMethod,
        annualRoiPercent: sourceVersion.annualRoiPercent,
        processingFeePercent: sourceVersion.processingFeePercent,
        processingFeeGstPercent: sourceVersion.processingFeeGstPercent,
        assessmentFeeAmount: sourceVersion.assessmentFeeAmount,
        assessmentFeeGstPercent: sourceVersion.assessmentFeeGstPercent,
        penalChargeAmount: sourceVersion.penalChargeAmount,
        bounceChargeAmount: sourceVersion.bounceChargeAmount,
        emiDueDay: sourceVersion.emiDueDay,
        includeAssessmentFeeInApr: sourceVersion.includeAssessmentFeeInApr,
        tenureType: sourceVersion.tenureType,
        effectiveFrom: sourceVersion.effectiveFrom,
        createdById: ctx.actorUserId,
        updatedById: ctx.actorUserId,
        multipliers: {
          create: sourceVersion.multipliers.map((m: any, index: number) => ({
            minimumCompletedLoans: m.minimumCompletedLoans,
            multiplier: m.multiplier,
            sortOrder: index,
          })),
        },
        tenures: {
          create: sourceVersion.tenures.map((t: any, index: number) => ({
            tenure: t.tenure,
            sortOrder: index,
          })),
        },
      },
    });

    await this.auditLog('PRODUCT_VERSION_CREATED', productId, 'SUCCESS', { sourceVersionId: sourceVersion.id }, { newVersionId: newVersion.id }, ctx);
    return newVersion;
  }
}
