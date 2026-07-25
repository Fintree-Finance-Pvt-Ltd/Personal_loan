import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditOutcome,
  Lender,
  LenderApprovalStatus,
  LenderOperationalStatus,
  Prisma,
} from '@prisma/client';

import type { AuthenticatedUser } from '../../common/types/auth-user.type';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type {
  CreateLenderInput,
  ListLendersInput,
  UpdateLenderInput,
} from './lender.validation';

interface RequestContext {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class LendersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(
    input: CreateLenderInput,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    try {
      const lender = await this.prisma.lender.create({
        data: {
          legalName: input.legalName,
          displayName: input.displayName,
          code: input.code,
          supportEmail: input.supportEmail ?? null,
          supportPhone: input.supportPhone ?? null,
          createdById: user.userId,
          updatedById: user.userId,
        },
      });

      await this.recordAudit(
        user,
        context,
        'LENDER_CREATE',
        'LENDER_CREATED',
        lender,
        undefined,
        lender,
      );

      return this.toResponse(lender);
    } catch (error: unknown) {
      this.handlePrismaError(error);
    }
  }

  async findAll(input: ListLendersInput) {
    const where: Prisma.LenderWhereInput = {
      approvalStatus: input.approvalStatus,
      operationalStatus: input.operationalStatus,
      OR: input.search
        ? [
            { legalName: { contains: input.search } },
            { displayName: { contains: input.search } },
            { code: { contains: input.search } },
            { supportEmail: { contains: input.search } },
          ]
        : undefined,
    };

    const skip = (input.page - 1) * input.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lender.findMany({
        where,
        skip,
        take: input.limit,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.lender.count({ where }),
    ]);

    return {
      items: items.map((lender) => this.toResponse(lender)),
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / input.limit)),
      },
    };
  }

  async findOne(id: string) {
    return this.toResponse(await this.getLenderOrThrow(id));
  }

  async update(
    id: string,
    input: UpdateLenderInput,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const existing = await this.getLenderOrThrow(id);

    if (
      existing.approvalStatus !== LenderApprovalStatus.DRAFT &&
      existing.approvalStatus !== LenderApprovalStatus.REJECTED
    ) {
      throw new ConflictException({
        error: {
          code: 'LENDER_NOT_EDITABLE',
          message: 'Only Draft or Rejected lenders can be edited.',
        },
      });
    }

    const resetRejectedState =
      existing.approvalStatus === LenderApprovalStatus.REJECTED;

    try {
      const result = await this.prisma.lender.updateMany({
        where: {
          id,
          version: existing.version,
          approvalStatus: {
            in: [
              LenderApprovalStatus.DRAFT,
              LenderApprovalStatus.REJECTED,
            ],
          },
        },
        data: {
          ...input,
          updatedById: user.userId,
          version: { increment: 1 },
          ...(resetRejectedState
            ? {
                approvalStatus: LenderApprovalStatus.DRAFT,
                submittedById: null,
                submittedAt: null,
                approvedById: null,
                approvedAt: null,
                rejectedById: null,
                rejectedAt: null,
                rejectionReason: null,
              }
            : {}),
        },
      });

      this.ensureOneRowUpdated(result.count);

      const updated = await this.getLenderOrThrow(id);

      await this.recordAudit(
        user,
        context,
        'LENDER_UPDATE',
        'LENDER_UPDATED',
        updated,
        existing,
        updated,
      );

      return this.toResponse(updated);
    } catch (error: unknown) {
      this.handlePrismaError(error);
    }
  }

  async submit(
    id: string,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const existing = await this.getLenderOrThrow(id);

    if (existing.approvalStatus !== LenderApprovalStatus.DRAFT) {
      throw new ConflictException({
        error: {
          code: 'LENDER_SUBMIT_INVALID_STATUS',
          message: 'Only a Draft lender can be submitted.',
        },
      });
    }

    const result = await this.prisma.lender.updateMany({
      where: {
        id,
        version: existing.version,
        approvalStatus: LenderApprovalStatus.DRAFT,
      },
      data: {
        approvalStatus: LenderApprovalStatus.SUBMITTED,
        submittedById: user.userId,
        submittedAt: new Date(),
        approvedById: null,
        approvedAt: null,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
        updatedById: user.userId,
        version: { increment: 1 },
      },
    });

    this.ensureOneRowUpdated(result.count);

    const updated = await this.getLenderOrThrow(id);

    await this.recordAudit(
      user,
      context,
      'LENDER_SUBMIT',
      'LENDER_SUBMITTED',
      updated,
      existing,
      updated,
    );

    return this.toResponse(updated);
  }

  async approve(
    id: string,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const existing = await this.getLenderOrThrow(id);

    if (existing.approvalStatus !== LenderApprovalStatus.SUBMITTED) {
      throw new ConflictException({
        error: {
          code: 'LENDER_APPROVE_INVALID_STATUS',
          message: 'Only a Submitted lender can be approved.',
        },
      });
    }

    const makerUserId = existing.submittedById ?? existing.createdById;

    if (makerUserId === user.userId) {
      throw new ForbiddenException({
        error: {
          code: 'MAKER_CHECKER_VIOLATION',
          message: 'The maker cannot approve their own lender.',
        },
      });
    }

    const result = await this.prisma.lender.updateMany({
      where: {
        id,
        version: existing.version,
        approvalStatus: LenderApprovalStatus.SUBMITTED,
      },
      data: {
        approvalStatus: LenderApprovalStatus.APPROVED,
        approvedById: user.userId,
        approvedAt: new Date(),
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
        updatedById: user.userId,
        version: { increment: 1 },
      },
    });

    this.ensureOneRowUpdated(result.count);

    const updated = await this.getLenderOrThrow(id);

    await this.recordAudit(
      user,
      context,
      'LENDER_APPROVE',
      'LENDER_APPROVED',
      updated,
      existing,
      updated,
    );

    return this.toResponse(updated);
  }

  async reject(
    id: string,
    reason: string,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const existing = await this.getLenderOrThrow(id);

    if (existing.approvalStatus !== LenderApprovalStatus.SUBMITTED) {
      throw new ConflictException({
        error: {
          code: 'LENDER_REJECT_INVALID_STATUS',
          message: 'Only a Submitted lender can be rejected.',
        },
      });
    }

    const makerUserId = existing.submittedById ?? existing.createdById;

    if (makerUserId === user.userId) {
      throw new ForbiddenException({
        error: {
          code: 'MAKER_CHECKER_VIOLATION',
          message: 'The maker cannot reject their own lender.',
        },
      });
    }

    const result = await this.prisma.lender.updateMany({
      where: {
        id,
        version: existing.version,
        approvalStatus: LenderApprovalStatus.SUBMITTED,
      },
      data: {
        approvalStatus: LenderApprovalStatus.REJECTED,
        operationalStatus: LenderOperationalStatus.INACTIVE,
        rejectedById: user.userId,
        rejectedAt: new Date(),
        rejectionReason: reason,
        approvedById: null,
        approvedAt: null,
        updatedById: user.userId,
        version: { increment: 1 },
      },
    });

    this.ensureOneRowUpdated(result.count);

    const updated = await this.getLenderOrThrow(id);

    await this.recordAudit(
      user,
      context,
      'LENDER_REJECT',
      'LENDER_REJECTED',
      updated,
      existing,
      updated,
      reason,
    );

    return this.toResponse(updated);
  }

  async activate(
    id: string,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const existing = await this.getLenderOrThrow(id);

    if (existing.approvalStatus !== LenderApprovalStatus.APPROVED) {
      throw new ConflictException({
        error: {
          code: 'LENDER_NOT_APPROVED',
          message: 'The lender must be approved before activation.',
        },
      });
    }

    if (existing.operationalStatus === LenderOperationalStatus.ACTIVE) {
      return this.toResponse(existing);
    }

    const result = await this.prisma.lender.updateMany({
      where: {
        id,
        version: existing.version,
        approvalStatus: LenderApprovalStatus.APPROVED,
        operationalStatus: LenderOperationalStatus.INACTIVE,
      },
      data: {
        operationalStatus: LenderOperationalStatus.ACTIVE,
        updatedById: user.userId,
        version: { increment: 1 },
      },
    });

    this.ensureOneRowUpdated(result.count);

    const updated = await this.getLenderOrThrow(id);

    await this.recordAudit(
      user,
      context,
      'LENDER_ACTIVATE',
      'LENDER_ACTIVATED',
      updated,
      existing,
      updated,
    );

    return this.toResponse(updated);
  }

  async deactivate(
    id: string,
    user: AuthenticatedUser,
    context: RequestContext,
  ) {
    const existing = await this.getLenderOrThrow(id);

    if (existing.operationalStatus === LenderOperationalStatus.INACTIVE) {
      return this.toResponse(existing);
    }

    const result = await this.prisma.lender.updateMany({
      where: {
        id,
        version: existing.version,
        operationalStatus: LenderOperationalStatus.ACTIVE,
      },
      data: {
        operationalStatus: LenderOperationalStatus.INACTIVE,
        updatedById: user.userId,
        version: { increment: 1 },
      },
    });

    this.ensureOneRowUpdated(result.count);

    const updated = await this.getLenderOrThrow(id);

    await this.recordAudit(
      user,
      context,
      'LENDER_DEACTIVATE',
      'LENDER_DEACTIVATED',
      updated,
      existing,
      updated,
    );

    return this.toResponse(updated);
  }

  private async getLenderOrThrow(id: string): Promise<Lender> {
    const lender = await this.prisma.lender.findUnique({ where: { id } });

    if (!lender) {
      throw new NotFoundException({
        error: {
          code: 'LENDER_NOT_FOUND',
          message: 'Lender not found.',
        },
      });
    }

    return lender;
  }

  private toResponse(lender: Lender) {
    return {
      ...lender,
      productCount: 0,
      allocationPercentage: null,
    };
  }

  private ensureOneRowUpdated(count: number): void {
    if (count !== 1) {
      throw new ConflictException({
        error: {
          code: 'LENDER_CONCURRENT_UPDATE',
          message: 'The lender changed in another request. Refresh and try again.',
        },
      });
    }
  }

  private async recordAudit(
    user: AuthenticatedUser,
    context: RequestContext,
    permissionCode: string,
    action: string,
    lender: Lender,
    previousValue?: Lender,
    newValue?: Lender,
    reason?: string,
  ): Promise<void> {
    await this.auditLogs.record({
      actorUserId: user.userId,
      actorRoleCodes: user.roleCodes,
      permissionCode,
      module: 'LENDER',
      action,
      entityType: 'LENDER',
      entityId: lender.id,
      outcome: AuditOutcome.SUCCESS,
      reason,
      previousValue: previousValue
        ? this.auditSnapshot(previousValue)
        : undefined,
      newValue: newValue ? this.auditSnapshot(newValue) : undefined,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  private auditSnapshot(lender: Lender) {
    return {
      id: lender.id,
      legalName: lender.legalName,
      displayName: lender.displayName,
      code: lender.code,
      supportEmail: lender.supportEmail,
      supportPhone: lender.supportPhone,
      approvalStatus: lender.approvalStatus,
      operationalStatus: lender.operationalStatus,
      integrationHealth: lender.integrationHealth,
      version: lender.version,
      submittedById: lender.submittedById,
      submittedAt: lender.submittedAt,
      approvedById: lender.approvedById,
      approvedAt: lender.approvedAt,
      rejectedById: lender.rejectedById,
      rejectedAt: lender.rejectedAt,
      rejectionReason: lender.rejectionReason,
      createdAt: lender.createdAt,
      updatedAt: lender.updatedAt,
    };
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException({
          error: {
            code: 'LENDER_CODE_EXISTS',
            message: 'A lender with this code already exists.',
          },
        });
      }

      if (error.code === 'P2025') {
        throw new NotFoundException({
          error: {
            code: 'LENDER_NOT_FOUND',
            message: 'Lender not found.',
          },
        });
      }
    }

    throw error;
  }
}
