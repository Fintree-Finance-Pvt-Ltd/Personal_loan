import { Injectable } from '@nestjs/common';
import { Prisma, SecuritySeverity } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { sanitizeObject } from '../../common/utils/security.utils';

export interface SecurityEventInput {
  userId?: string | null;
  sessionId?: string | null;
  eventType: string;
  severity: SecuritySeverity;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SecurityEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: SecurityEventInput): Promise<void> {
    const metadata = sanitizeObject(input.metadata ?? {}) as Prisma.InputJsonValue;
    await this.prisma.securityEvent.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        eventType: input.eventType,
        severity: input.severity,
        requestId: input.requestId,
        ipAddress: input.ipAddress?.slice(0, 64),
        userAgent: input.userAgent?.slice(0, 512),
        metadata,
      },
      select: { id: true },
    });
  }
}
