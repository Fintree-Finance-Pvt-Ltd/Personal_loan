import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { hmacHex, sanitizeObject } from '../../common/utils/security.utils';

export interface AuditInput {
  actorUserId?: string | null;
  actorRoleCodes?: string[];
  permissionCode?: string | null;
  module: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome: AuditOutcome;
  reason?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async record(input: AuditInput): Promise<void> {
    const createdAt = new Date();
    const previousValue = sanitizeObject(input.previousValue) as Prisma.InputJsonValue | undefined;
    const newValue = sanitizeObject(input.newValue) as Prisma.InputJsonValue | undefined;
    const canonical = JSON.stringify({
      ...input,
      previousValue,
      newValue,
      actorRoleCodes: [...(input.actorRoleCodes ?? [])].sort(),
      createdAt: createdAt.toISOString(),
    });
    const integrityHash = hmacHex(canonical, this.config.getOrThrow<string>('AUDIT_INTEGRITY_KEY'));
    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        actorRoleCodes: input.actorRoleCodes ?? [],
        permissionCode: input.permissionCode,
        module: input.module,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        outcome: input.outcome,
        reason: input.reason?.slice(0, 255),
        previousValue,
        newValue,
        requestId: input.requestId,
        ipAddress: input.ipAddress?.slice(0, 64),
        userAgent: input.userAgent?.slice(0, 512),
        integrityHash,
        createdAt,
      },
      select: { id: true },
    });
  }
}
