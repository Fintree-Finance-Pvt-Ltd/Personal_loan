import { HttpException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let config: any;
  let jwt: any;
  let audit: any;
  let securityEvents: any;

  const context = { requestId: 'req-1', ipAddress: '10.0.0.1', userAgent: 'jest' };
  const PASSWORD = 'CorrectHorseBatteryStaple1!';
  let passwordHash: string;

  const CONFIG_VALUES: Record<string, unknown> = {
    REFRESH_SESSION_HOURS: 8,
    REFRESH_IDLE_TIMEOUT_MINUTES: 30,
    LOGIN_MAX_FAILED_ATTEMPTS: 5,
    LOGIN_LOCK_MINUTES: 30,
    ARGON2_MEMORY_COST: 19456,
    ARGON2_TIME_COST: 2,
    ARGON2_PARALLELISM: 1,
    SECURITY_HMAC_KEY: 'a'.repeat(32),
    REFRESH_TOKEN_PEPPER: 'b'.repeat(32),
    JWT_ACCESS_SECRET: 'c'.repeat(32),
    JWT_ISSUER: 'personal-loan-platform',
    JWT_AUDIENCE: 'personal-loan-admin',
    JWT_ACCESS_EXPIRES_IN: '10m',
  };

  const baseUser = () => ({
    id: 'user-1',
    name: 'Admin One',
    email: 'admin@example.com',
    passwordHash,
    status: 'ACTIVE',
    failedLoginCount: 0,
    lockedUntil: null as Date | null,
    authVersion: 1,
    roles: [
      { role: { code: 'SUPERADMIN', permissions: [{ permission: { code: 'ALL' } }] } },
    ],
  });

  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      session: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      refreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
      loginAttempt: { create: jest.fn() },
      // AuthService calls $transaction both ways: a callback (login, refresh's
      // rotation) and Prisma's array-of-promises form (revokeForReuse, logout).
      $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    };

    config = {
      getOrThrow: jest.fn((key: string) => {
        if (!(key in CONFIG_VALUES)) throw new Error(`AuthService requested unmocked config key in test: ${key}`);
        return CONFIG_VALUES[key];
      }),
    };

    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    securityEvents = { record: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(prisma as any, config, jwt, audit, securityEvents);
    await service.onModuleInit();
  });

  describe('login', () => {
    it('rejects an unknown email the same way it rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const err: any = await service
        .login({ email: 'nobody@example.com', password: PASSWORD } as any, context)
        .catch((e) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.getResponse()).toMatchObject({ error: { code: 'AUTH_INVALID_CREDENTIALS' } });
      expect(securityEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'LOGIN_FAILED' }),
      );
    });

    it('records a failed attempt without locking the account below the threshold', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser(), failedLoginCount: 1 });

      await expect(
        service.login({ email: 'admin@example.com', password: 'wrong-password-1!' } as any, context),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginCount: { increment: 1 }, lockedUntil: undefined }),
        }),
      );
    });

    it('locks the account once failed attempts reach the configured threshold', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser(), failedLoginCount: 4 });

      await expect(
        service.login({ email: 'admin@example.com', password: 'wrong-password-1!' } as any, context),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: expect.any(Date) }),
        }),
      );
      expect(securityEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'ACCOUNT_TEMPORARILY_LOCKED', severity: 'HIGH' }),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_LOCKED' }));
    });

    it('rejects a correct password while the account is still within its lock window', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser(),
        lockedUntil: new Date(Date.now() + 60_000),
      });

      const err: any = await service
        .login({ email: 'admin@example.com', password: PASSWORD } as any, context)
        .catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(423);
      expect(err.getResponse()).toMatchObject({ error: { code: 'ACCOUNT_TEMPORARILY_LOCKED' } });
    });

    it('rejects a disabled account even with the correct password', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser(), status: 'DISABLED' });

      await expect(
        service.login({ email: 'admin@example.com', password: PASSWORD } as any, context),
      ).rejects.toThrow(UnauthorizedException);
      expect(securityEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'USER_DISABLED_ACCESS_ATTEMPT' }),
      );
    });

    it('issues a session on success with the idle window capped by the absolute session length', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser());
      prisma.session.create.mockResolvedValue({ id: 'session-1' });

      const result = await service.login({ email: 'admin@example.com', password: PASSWORD } as any, context);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.sessionId).toBe('session-1');

      const sessionData = prisma.session.create.mock.calls[0][0].data;
      const idleMs = sessionData.idleExpiresAt.getTime() - Date.now();
      // REFRESH_IDLE_TIMEOUT_MINUTES=30, well inside the 8-hour absolute cap,
      // so the idle window (not the absolute cap) should be what was applied.
      expect(idleMs).toBeGreaterThan(29 * 60_000);
      expect(idleMs).toBeLessThanOrEqual(30 * 60_000 + 5_000);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }) }),
      );
      expect(securityEvents.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'LOGIN_SUCCESS' }));
      expect(securityEvents.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'SESSION_CREATED' }));
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ADMIN_LOGIN', outcome: 'SUCCESS' }));
    });

    it('caps the idle window at the absolute session length when idle would otherwise run past it', async () => {
      config.getOrThrow.mockImplementation((key: string) => {
        if (key === 'REFRESH_SESSION_HOURS') return 0.008; // ~29 seconds — shorter than the 30-min idle window
        if (!(key in CONFIG_VALUES)) throw new Error(`AuthService requested unmocked config key in test: ${key}`);
        return CONFIG_VALUES[key];
      });
      prisma.user.findUnique.mockResolvedValue(baseUser());
      prisma.session.create.mockResolvedValue({ id: 'session-1' });

      await service.login({ email: 'admin@example.com', password: PASSWORD } as any, context);

      const sessionData = prisma.session.create.mock.calls[0][0].data;
      expect(sessionData.idleExpiresAt.getTime()).toBe(sessionData.absoluteExpiresAt.getTime());
    });
  });

  describe('refresh', () => {
    const buildToken = (overrides: any = {}) => {
      const { session: sessionOverrides, ...tokenOverrides } = overrides;
      return {
        id: 'token-1',
        usedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 3_600_000),
        ...tokenOverrides,
        session: {
          id: 'session-1',
          userId: 'user-1',
          revokedAt: null,
          absoluteExpiresAt: new Date(Date.now() + 3_600_000),
          idleExpiresAt: new Date(Date.now() + 1_800_000),
          user: baseUser(),
          ...sessionOverrides,
        },
      };
    };

    it('rejects when no refresh token cookie was sent', async () => {
      await expect(service.refresh(undefined, context)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unrecognized refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('unknown-token', context)).rejects.toThrow(UnauthorizedException);
    });

    it('revokes the whole session when an already-used refresh token is replayed', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(buildToken({ usedAt: new Date() }));

      await expect(service.refresh('stale-token', context)).rejects.toThrow(UnauthorizedException);

      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revokedReason: 'REFRESH_TOKEN_REUSE' }) }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sessionId: 'session-1', revokedAt: null } }),
      );
      expect(securityEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'REFRESH_TOKEN_REUSE', severity: 'CRITICAL' }),
      );
    });

    it('rejects once the session has idled out, even though the refresh token itself has not expired', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        buildToken({ session: { idleExpiresAt: new Date(Date.now() - 1_000) } }),
      );

      await expect(service.refresh('idle-token', context)).rejects.toThrow(UnauthorizedException);
      expect(securityEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'EXPIRED_SESSION', severity: 'LOW' }),
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects once the session has passed its absolute expiry', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        buildToken({ session: { absoluteExpiresAt: new Date(Date.now() - 1_000) } }),
      );
      await expect(service.refresh('expired-token', context)).rejects.toThrow(UnauthorizedException);
    });

    it('rotates the refresh token and slides the idle window forward on a valid refresh', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(buildToken());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refresh('good-token', context);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'token-1', usedAt: null, revokedAt: null } }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sessionId: 'session-1', parentTokenId: 'token-1' }) }),
      );
      const sessionUpdateData = prisma.session.update.mock.calls[0][0].data;
      expect(sessionUpdateData.idleExpiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(securityEvents.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'SESSION_REFRESHED' }));
    });

    it('treats a lost claim race (two concurrent refreshes) as reuse rather than silently succeeding twice', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(buildToken());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh('raced-token', context)).rejects.toThrow(UnauthorizedException);
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revokedReason: 'REFRESH_TOKEN_REUSE' }) }),
      );
    });
  });

  describe('logout', () => {
    it('revokes the current session and its refresh tokens', async () => {
      const user = {
        userId: 'user-1',
        sessionId: 'session-1',
        roleCodes: ['SUPERADMIN'],
        permissionCodes: [],
        name: 'Admin One',
        email: 'admin@example.com',
      };

      const result = await service.logout(user as any, context);

      expect(result).toEqual({ loggedOut: true });
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1', userId: 'user-1', revokedAt: null },
          data: expect.objectContaining({ revokedReason: 'LOGOUT' }),
        }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sessionId: 'session-1', revokedAt: null } }),
      );
      expect(securityEvents.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'SESSION_REVOKED' }));
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ADMIN_LOGOUT' }));
    });
  });
});
