import { ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';

const context = (permissionCodes?: string[]) =>
  ({
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: permissionCodes ? { userId: 'u1', sessionId: 's1', permissionCodes } : undefined,
        requestId: 'request-123',
        path: '/admin/dashboard',
        method: 'GET',
        ip: '127.0.0.1',
        get: () => 'test-agent',
      }),
    }),
  }) as any;

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => (key === 'permissions' ? ['ADMIN_DASHBOARD_VIEW'] : false)),
  };
  const securityEvents = { record: jest.fn().mockResolvedValue(undefined) };
  const guard = new PermissionsGuard(reflector as any, securityEvents as any);

  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when an authenticated user lacks a permission', async () => {
    await expect(guard.canActivate(context(['USER_READ']))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an exact permission match', async () => {
    await expect(guard.canActivate(context(['ADMIN_DASHBOARD_VIEW']))).resolves.toBe(true);
  });

  it('does not allow substring permission matches and records forbidden access', async () => {
    await expect(guard.canActivate(context(['ADMIN_DASHBOARD_VIEW_ALL']))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(securityEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'FORBIDDEN_ACCESS', severity: 'MEDIUM' }),
    );
  });
});
