import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from '../src/modules/auth/auth.service';

jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn().mockResolvedValue('$argon2id$dummy'),
  argon2id: 2,
}));

const nowPlus = (minutes: number) => new Date(Date.now() + minutes * 60_000);
const baseUser = {
  id: 'user-1',
  name: 'Admin User',
  email: 'admin@example.com',
  passwordHash: '$argon2id$stored',
  status: 'ACTIVE',
  failedLoginCount: 0,
  lockedUntil: null,
  authVersion: 1,
  roles: [
    {
      role: {
        code: 'SUPERADMIN',
        permissions: [{ permission: { code: 'ADMIN_DASHBOARD_VIEW' } }],
      },
    },
  ],
};
const requestContext = { requestId: 'request-123', ipAddress: '127.0.0.1', userAgent: 'Chrome Windows' };

function setup(user = baseUser) {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({ id: user?.id }),
    },
    session: {
      create: jest.fn().mockResolvedValue({ id: 'session-12345678901234567890' }),
      update: jest.fn().mockResolvedValue({ id: 'session-12345678901234567890' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    loginAttempt: { create: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
  };
  prisma.$transaction = jest.fn(async (value: any) =>
    typeof value === 'function' ? value(prisma) : Promise.all(value),
  );
  const values: Record<string, unknown> = {
    ARGON2_MEMORY_COST: 19456,
    ARGON2_TIME_COST: 2,
    ARGON2_PARALLELISM: 1,
    LOGIN_MAX_FAILED_ATTEMPTS: 5,
    LOGIN_LOCK_MINUTES: 30,
    REFRESH_SESSION_HOURS: 8,
    REFRESH_IDLE_TIMEOUT_MINUTES: 30,
    REFRESH_TOKEN_PEPPER: 'refresh-pepper-long-enough-for-unit-tests',
    SECURITY_HMAC_KEY: 'security-hmac-key-long-enough-for-tests',
    AUDIT_INTEGRITY_KEY: 'audit-key-long-enough-for-unit-tests',
    JWT_ISSUER: 'personal-loan-platform',
    JWT_AUDIENCE: 'personal-loan-admin',
    JWT_ACCESS_EXPIRES_IN: '10m',
  };
  const config = { getOrThrow: jest.fn((key: string) => values[key]) };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.access.token') };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const security = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(prisma, config as any, jwt as any, audit as any, security as any);
  return { service, prisma, audit, security };
}

describe('AuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('performs valid login, resets failures, and creates a session', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    const { service, prisma } = setup();
    const result = await service.login(
      { email: 'ADMIN@example.com', password: 'V3ry-Str0ng-Phrase!' },
      requestContext,
    );
    expect(result.accessToken).toBe('signed.access.token');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }) }),
    );
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('returns a generic 401 for an unknown user', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    const { service } = setup(null as any);
    await expect(
      service.login({ email: 'unknown@example.com', password: 'V3ry-Str0ng-Phrase!' }, requestContext),
    ).rejects.toMatchObject({
      response: { error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
    });
  });

  it('returns the same generic 401 for an incorrect password', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    const { service } = setup();
    await expect(
      service.login({ email: 'admin@example.com', password: 'Wr0ng-Password!' }, requestContext),
    ).rejects.toMatchObject({
      response: { error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
    });
  });

  it('increments the failed-attempt counter transactionally', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    const { service, prisma } = setup({ ...baseUser, failedLoginCount: 1 });
    await expect(
      service.login({ email: 'admin@example.com', password: 'Wr0ng-Password!' }, requestContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedLoginCount: { increment: 1 } }) }),
    );
  });

  it('locks the account after the configured threshold', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    const { service, prisma, security } = setup({ ...baseUser, failedLoginCount: 4 });
    await expect(
      service.login({ email: 'admin@example.com', password: 'Wr0ng-Password!' }, requestContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lockedUntil: expect.any(Date) }) }),
    );
    expect(security.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'ACCOUNT_TEMPORARILY_LOCKED' }),
    );
  });

  it('does not allow a disabled user to log in', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    const { service, security } = setup({ ...baseUser, status: 'DISABLED' });
    await expect(
      service.login({ email: 'admin@example.com', password: 'V3ry-Str0ng-Phrase!' }, requestContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(security.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'USER_DISABLED_ACCESS_ATTEMPT' }),
    );
  });

  it('stores only a keyed hash of the raw refresh token', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    const { service, prisma } = setup();
    const result = await service.login(
      { email: 'admin@example.com', password: 'V3ry-Str0ng-Phrase!' },
      requestContext,
    );
    const stored = prisma.refreshToken.create.mock.calls[0][0].data.tokenHash;
    expect(stored).toHaveLength(64);
    expect(stored).not.toBe(result.refreshToken);
  });

  it('rotates refresh tokens and invalidates the previous token', async () => {
    const { service, prisma } = setup();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      usedAt: null,
      revokedAt: null,
      expiresAt: nowPlus(60),
      session: {
        id: 'session-12345678901234567890',
        userId: baseUser.id,
        revokedAt: null,
        absoluteExpiresAt: nowPlus(60),
        idleExpiresAt: nowPlus(30),
        user: baseUser,
      },
    });
    const result = await service.refresh('raw-refresh', requestContext);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { usedAt: expect.any(Date) } }),
    );
    expect(result.refreshToken).not.toBe('raw-refresh');
  });

  it('revokes the whole session when refresh-token reuse is detected', async () => {
    const { service, prisma, security } = setup();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      usedAt: new Date(),
      revokedAt: null,
      expiresAt: nowPlus(60),
      session: {
        id: 'session-12345678901234567890',
        userId: baseUser.id,
        revokedAt: null,
        absoluteExpiresAt: nowPlus(60),
        idleExpiresAt: nowPlus(30),
        user: baseUser,
      },
    });
    await expect(service.refresh('reused-token', requestContext)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedReason: 'REFRESH_TOKEN_REUSE' }) }),
    );
    expect(security.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'REFRESH_TOKEN_REUSE', severity: 'CRITICAL' }),
    );
  });
});
