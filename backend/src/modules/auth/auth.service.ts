import {
  HttpException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SecurityEventsService } from '../security-events/security-events.service';
import {
  deviceLabel,
  hmacHex,
  maskEmail,
  normalizeEmail,
} from '../../common/utils/security.utils';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';
import type { AdminLoginDto } from './dto/admin-login.dto';

interface RequestContext {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

interface TokenResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    roleCodes: string[];
    permissionCodes: string[];
  };
  sessionId: string;
}

const userAuthSelect = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  status: true,
  failedLoginCount: true,
  lockedUntil: true,
  authVersion: true,
  roles: {
    where: { role: { status: 'ACTIVE' as const } },
    select: {
      role: {
        select: {
          code: true,
          permissions: { select: { permission: { select: { code: true } } } },
        },
      },
    },
  },
} as const;

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly audit: AuditLogsService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hashPassword(randomBytes(24).toString('base64url') + 'Aa1!');
  }

  async login(dto: AdminLoginDto, context: RequestContext): Promise<TokenResult> {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email }, select: userAuthSelect });
    const validPassword = await argon2.verify(user?.passwordHash ?? this.dummyHash, dto.password).catch(() => false);

    if (!user || !validPassword || user.status !== 'ACTIVE') {
      if (user && !validPassword) await this.registerFailure(user, email, context);
      else await this.recordAttempt(user?.id, email, user?.status === 'DISABLED' ? 'DISABLED' : 'FAILURE', 'INVALID_CREDENTIALS', context);
      await this.securityEvents.record({
        userId: user?.id,
        eventType: user?.status === 'DISABLED' ? 'USER_DISABLED_ACCESS_ATTEMPT' : 'LOGIN_FAILED',
        severity: 'MEDIUM',
        ...context,
        metadata: { reasonCode: 'INVALID_CREDENTIALS' },
      });
      this.invalidCredentials();
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      await this.recordAttempt(user.id, email, 'LOCKED', 'ACCOUNT_TEMPORARILY_LOCKED', context);
      throw new HttpException(
        { error: { code: 'ACCOUNT_TEMPORARILY_LOCKED', message: 'This account is temporarily locked.' } },
        423,
      );
    }

    const rawRefreshToken = randomBytes(48).toString('base64url');
    const absoluteExpiresAt = new Date(now.getTime() + this.config.getOrThrow<number>('REFRESH_SESSION_HOURS') * 3_600_000);
    const idleExpiresAt = this.idleExpiry(now, absoluteExpiresAt);
    const refreshHash = this.hashRefreshToken(rawRefreshToken);
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
        select: { id: true },
      });
      const session = await transaction.session.create({
        data: {
          userId: user.id,
          absoluteExpiresAt,
          idleExpiresAt,
          ipAddress: context.ipAddress?.slice(0, 64),
          userAgent: context.userAgent?.slice(0, 512),
          deviceLabel: deviceLabel(context.userAgent),
          requestId: context.requestId,
        },
        select: { id: true },
      });
      await transaction.refreshToken.create({
        data: { sessionId: session.id, tokenHash: refreshHash, expiresAt: absoluteExpiresAt },
        select: { id: true },
      });
      await transaction.loginAttempt.create({
        data: this.loginAttemptData(user.id, email, 'SUCCESS', 'LOGIN_SUCCESS', context),
        select: { id: true },
      });
      return session;
    });
    const safeUser = this.safeUser(user);
    const accessToken = await this.issueAccessToken(user.id, result.id, user.authVersion);
    await Promise.all([
      this.securityEvents.record({
        userId: user.id,
        sessionId: result.id,
        eventType: 'LOGIN_SUCCESS',
        severity: 'INFO',
        ...context,
      }),
      this.securityEvents.record({
        userId: user.id,
        sessionId: result.id,
        eventType: 'SESSION_CREATED',
        severity: 'INFO',
        ...context,
      }),
      this.audit.record({
        actorUserId: user.id,
        actorRoleCodes: safeUser.roleCodes,
        module: 'AUTH',
        action: 'ADMIN_LOGIN',
        entityType: 'SESSION',
        entityId: result.id,
        outcome: 'SUCCESS',
        ...context,
      }),
    ]);
    return { accessToken, refreshToken: rawRefreshToken, user: safeUser, sessionId: result.id };
  }

  async refresh(rawToken: string | undefined, context: RequestContext): Promise<TokenResult> {
    if (!rawToken) this.invalidRefresh();
    const tokenHash = this.hashRefreshToken(rawToken as string);
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        usedAt: true,
        revokedAt: true,
        expiresAt: true,
        session: {
          select: {
            id: true,
            userId: true,
            revokedAt: true,
            absoluteExpiresAt: true,
            idleExpiresAt: true,
            user: { select: userAuthSelect },
          },
        },
      },
    });
    if (!token) this.invalidRefresh();
    if (token.usedAt) {
      await this.revokeForReuse(token.session.id, token.session.userId, context);
      this.invalidRefresh();
    }
    const now = new Date();
    if (
      token.revokedAt ||
      token.expiresAt <= now ||
      token.session.revokedAt ||
      token.session.absoluteExpiresAt <= now ||
      token.session.idleExpiresAt <= now ||
      token.session.user.status !== 'ACTIVE'
    ) {
      await this.securityEvents.record({
        userId: token.session.userId,
        sessionId: token.session.id,
        eventType: 'EXPIRED_SESSION',
        severity: 'LOW',
        ...context,
      });
      this.invalidRefresh();
    }
    const replacement = randomBytes(48).toString('base64url');
    const replacementHash = this.hashRefreshToken(replacement);
    const idleExpiresAt = this.idleExpiry(now, token.session.absoluteExpiresAt);
    const rotated = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.refreshToken.updateMany({
        where: { id: token.id, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      await transaction.refreshToken.create({
        data: {
          sessionId: token.session.id,
          tokenHash: replacementHash,
          parentTokenId: token.id,
          expiresAt: token.session.absoluteExpiresAt,
        },
        select: { id: true },
      });
      await transaction.session.update({
        where: { id: token.session.id },
        data: { lastSeenAt: now, idleExpiresAt },
        select: { id: true },
      });
      return true;
    });
    if (!rotated) {
      await this.revokeForReuse(token.session.id, token.session.userId, context);
      this.invalidRefresh();
    }
    const user = token.session.user;
    const safeUser = this.safeUser(user);
    const accessToken = await this.issueAccessToken(user.id, token.session.id, user.authVersion);
    await this.securityEvents.record({
      userId: user.id,
      sessionId: token.session.id,
      eventType: 'SESSION_REFRESHED',
      severity: 'INFO',
      ...context,
    });
    return {
      accessToken,
      refreshToken: replacement,
      user: safeUser,
      sessionId: token.session.id,
    };
  }

  async logout(user: AuthenticatedUser, context: RequestContext): Promise<{ loggedOut: true }> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: user.sessionId, userId: user.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'LOGOUT' },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId: user.sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    await Promise.all([
      this.securityEvents.record({
        userId: user.userId,
        sessionId: user.sessionId,
        eventType: 'SESSION_REVOKED',
        severity: 'INFO',
        ...context,
        metadata: { reasonCode: 'LOGOUT' },
      }),
      this.audit.record({
        actorUserId: user.userId,
        actorRoleCodes: user.roleCodes,
        module: 'AUTH',
        action: 'ADMIN_LOGOUT',
        entityType: 'SESSION',
        entityId: user.sessionId,
        outcome: 'SUCCESS',
        ...context,
      }),
    ]);
    return { loggedOut: true };
  }

  me(user: AuthenticatedUser) {
    return {
      user: { id: user.userId, name: user.name, email: user.email },
      roleCodes: user.roleCodes,
      permissionCodes: user.permissionCodes,
      sessionId: user.sessionId,
    };
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.config.getOrThrow<number>('ARGON2_MEMORY_COST'),
      timeCost: this.config.getOrThrow<number>('ARGON2_TIME_COST'),
      parallelism: this.config.getOrThrow<number>('ARGON2_PARALLELISM'),
    });
  }

  private async registerFailure(user: any, email: string, context: RequestContext): Promise<void> {
    const threshold = this.config.getOrThrow<number>('LOGIN_MAX_FAILED_ATTEMPTS');
    const nextCount = user.failedLoginCount + 1;
    const shouldLock = nextCount >= threshold;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + this.config.getOrThrow<number>('LOGIN_LOCK_MINUTES') * 60_000)
      : undefined;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: shouldLock ? 0 : { increment: 1 },
          lockedUntil,
        },
        select: { id: true },
      });
      await transaction.loginAttempt.create({
        data: this.loginAttemptData(
          user.id,
          email,
          shouldLock ? 'LOCKED' : 'FAILURE',
          shouldLock ? 'ACCOUNT_TEMPORARILY_LOCKED' : 'INVALID_CREDENTIALS',
          context,
        ),
        select: { id: true },
      });
    });
    if (shouldLock) {
      await Promise.all([
        this.securityEvents.record({
          userId: user.id,
          eventType: 'ACCOUNT_TEMPORARILY_LOCKED',
          severity: 'HIGH',
          ...context,
        }),
        this.audit.record({
          actorUserId: user.id,
          actorRoleCodes: [],
          module: 'AUTH',
          action: 'ACCOUNT_LOCKED',
          entityType: 'USER',
          entityId: user.id,
          outcome: 'SUCCESS',
          reason: 'FAILED_LOGIN_THRESHOLD',
          ...context,
        }),
      ]);
    }
  }

  private async recordAttempt(
    userId: string | undefined,
    email: string,
    outcome: 'FAILURE' | 'LOCKED' | 'DISABLED',
    reasonCode: string,
    context: RequestContext,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: this.loginAttemptData(userId, email, outcome, reasonCode, context),
      select: { id: true },
    });
  }

  private loginAttemptData(
    userId: string | undefined,
    email: string,
    outcome: 'SUCCESS' | 'FAILURE' | 'LOCKED' | 'DISABLED',
    reasonCode: string,
    context: RequestContext,
  ) {
    return {
      userId,
      emailFingerprint: hmacHex(email, this.config.getOrThrow<string>('SECURITY_HMAC_KEY')),
      maskedEmail: maskEmail(email),
      outcome,
      reasonCode,
      ipAddress: context.ipAddress?.slice(0, 64),
      userAgent: context.userAgent?.slice(0, 512),
      requestId: context.requestId,
    };
  }

  private async revokeForReuse(sessionId: string, userId: string, context: RequestContext): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'REFRESH_TOKEN_REUSE' },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    await this.securityEvents.record({
      userId,
      sessionId,
      eventType: 'REFRESH_TOKEN_REUSE',
      severity: 'CRITICAL',
      ...context,
    });
  }

  private safeUser(user: any) {
    const roleCodes = user.roles.map(({ role }: any) => role.code);
    const permissionCodes = [
      ...new Set<string>(
        user.roles.flatMap(({ role }: any) =>
          role.permissions.map(({ permission }: any) => permission.code as string),
        ),
      ),
    ];
    return { id: user.id, name: user.name, email: user.email, roleCodes, permissionCodes };
  }

  private async issueAccessToken(userId: string, sessionId: string, authVersion: number): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, type: 'access', authVersion },
      {
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
        expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN') as any,
      },
    );
  }

  private hashRefreshToken(token: string): string {
    return hmacHex(token, this.config.getOrThrow<string>('REFRESH_TOKEN_PEPPER'));
  }

  private idleExpiry(now: Date, absolute: Date): Date {
    const idle = new Date(
      now.getTime() + this.config.getOrThrow<number>('REFRESH_IDLE_TIMEOUT_MINUTES') * 60_000,
    );
    return idle < absolute ? idle : absolute;
  }

  private invalidCredentials(): never {
    throw new UnauthorizedException({
      error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password.' },
    });
  }

  private invalidRefresh(): never {
    throw new UnauthorizedException({
      error: { code: 'AUTH_REFRESH_INVALID', message: 'Your session is no longer valid.' },
    });
  }
}
