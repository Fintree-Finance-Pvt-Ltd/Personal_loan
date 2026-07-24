import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { SessionsService } from '../src/modules/sessions/sessions.service';
import { JsonLoggerService } from '../src/infrastructure/logging/json-logger.service';

describe('access and session enforcement', () => {
  it('returns 401 when an access token is missing or invalid', () => {
    const guard = new JwtAuthGuard({} as any);
    expect(() => guard.handleRequest(undefined, undefined)).toThrow(UnauthorizedException);
  });

  it('rejects a revoked session at JWT validation time', async () => {
    const config = {
      getOrThrow: (key: string) =>
        ({
          JWT_ACCESS_SECRET: 'unit-test-secret-that-is-long-enough',
          JWT_ISSUER: 'personal-loan-platform',
          JWT_AUDIENCE: 'personal-loan-admin',
        })[key],
    };
    const prisma = { session: { findFirst: jest.fn().mockResolvedValue(null) } };
    const strategy = new JwtStrategy(config as any, prisma as any);
    await expect(
      strategy.validate({ sub: 'user-1', sid: 'revoked-session', type: 'access', authVersion: 1 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ revokedAt: null }) }),
    );
  });

  it('prevents a user from revoking another user session', async () => {
    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue({ id: 'session-owned-by-user-2', userId: 'user-2', revokedAt: null }),
      },
    };
    const service = new SessionsService(prisma as any, {} as any, {} as any);
    await expect(
      service.revokeOwn(
        {
          userId: 'user-1',
          sessionId: 'current-session',
          authVersion: 1,
          name: 'Admin',
          email: 'admin@example.com',
          roleCodes: [],
          permissionCodes: ['SESSION_REVOKE_OWN'],
        },
        'session-owned-by-user-2',
        { requestId: 'request-123' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('redacts passwords and tokens from structured logs', () => {
    const logger = new JsonLoggerService();
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger.log({ event: 'test', password: 'never-log', refreshToken: 'never-log-either' });
    const output = String(write.mock.calls[0][0]);
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('never-log');
    write.mockRestore();
  });
});
