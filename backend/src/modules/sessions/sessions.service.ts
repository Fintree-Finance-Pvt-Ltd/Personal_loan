import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SecurityEventsService } from '../security-events/security-events.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { maskIp } from '../../common/utils/security.utils';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';

interface RequestContext {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async listOwn(user: AuthenticatedUser) {
    const sessions = await this.prisma.session.findMany({
      where: { userId: user.userId },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
      select: {
        id: true,
        deviceLabel: true,
        ipAddress: true,
        createdAt: true,
        lastSeenAt: true,
        absoluteExpiresAt: true,
        idleExpiresAt: true,
        revokedAt: true,
        revokedReason: true,
      },
    });
    return sessions.map((session) => ({
      ...session,
      ipAddress: maskIp(session.ipAddress),
      isCurrent: session.id === user.sessionId,
    }));
  }

  async revokeOwn(user: AuthenticatedUser, sessionId: string, context: RequestContext): Promise<{ revoked: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (!session) throw new NotFoundException();
    if (session.userId !== user.userId) {
      throw new ForbiddenException({
        error: { code: 'SESSION_NOT_OWNED', message: 'You cannot revoke this session.' },
      });
    }
    const now = new Date();
    const result = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.session.updateMany({
        where: { id: sessionId, userId: user.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'USER_REVOKED' },
      });
      await transaction.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
      return updated.count > 0;
    });
    if (result) await this.recordRevocation(user, sessionId, 'SESSION_REVOKED', context);
    return { revoked: result };
  }

  async revokeOthers(user: AuthenticatedUser, context: RequestContext): Promise<{ revokedCount: number }> {
    const now = new Date();
    const sessionIds = await this.prisma.session.findMany({
      where: { userId: user.userId, id: { not: user.sessionId }, revokedAt: null },
      select: { id: true },
    });
    const ids = sessionIds.map(({ id }) => id);
    const count = await this.prisma.$transaction(async (transaction) => {
      if (ids.length === 0) return 0;
      const updated = await transaction.session.updateMany({
        where: { id: { in: ids }, userId: user.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'OTHER_SESSIONS_REVOKED' },
      });
      await transaction.refreshToken.updateMany({
        where: { sessionId: { in: ids }, revokedAt: null },
        data: { revokedAt: now },
      });
      return updated.count;
    });
    await this.audit.record({
      actorUserId: user.userId,
      actorRoleCodes: user.roleCodes,
      permissionCode: 'SESSION_REVOKE_ALL',
      module: 'AUTH',
      action: 'OTHER_SESSIONS_REVOKED',
      entityType: 'USER',
      entityId: user.userId,
      outcome: 'SUCCESS',
      newValue: { revokedCount: count },
      ...context,
    });
    return { revokedCount: count };
  }

  private async recordRevocation(
    user: AuthenticatedUser,
    sessionId: string,
    action: string,
    context: RequestContext,
  ): Promise<void> {
    await Promise.all([
      this.securityEvents.record({
        userId: user.userId,
        sessionId,
        eventType: 'SESSION_REVOKED',
        severity: 'INFO',
        ...context,
      }),
      this.audit.record({
        actorUserId: user.userId,
        actorRoleCodes: user.roleCodes,
        permissionCode: 'SESSION_REVOKE_OWN',
        module: 'AUTH',
        action,
        entityType: 'SESSION',
        entityId: sessionId,
        outcome: 'SUCCESS',
        ...context,
      }),
    ]);
  }
}
