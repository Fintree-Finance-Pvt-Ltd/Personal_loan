import { AuthController } from '../src/modules/auth/auth.controller';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('HTTP security contracts', () => {
  it('sets refresh cookies as HttpOnly with a restricted path', () => {
    const config = {
      getOrThrow: (key: string) =>
        ({ COOKIE_NAME: 'plp_admin_refresh', COOKIE_SECURE: false, API_PREFIX: 'api', REFRESH_SESSION_HOURS: 8 })[key],
    };
    const controller = new AuthController({} as any, {} as any, config as any);
    const options = (controller as any).cookieOptions();
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/api/auth/admin' });
  });

  it('logout uses the same cookie options when clearing the cookie', async () => {
    const auth = { logout: jest.fn().mockResolvedValue({ loggedOut: true }) };
    const config = {
      getOrThrow: (key: string) =>
        ({
          COOKIE_NAME: 'plp_admin_refresh',
          COOKIE_SECURE: false,
          API_PREFIX: 'api',
          REFRESH_SESSION_HOURS: 8,
          FRONTEND_URL: 'http://localhost:5173',
        })[key],
    };
    const controller = new AuthController(auth as any, {} as any, config as any);
    const response = { clearCookie: jest.fn() };
    const request = { requestId: 'request-123', ip: '127.0.0.1', get: () => 'agent' };
    await controller.logout(
      {},
      { userId: 'u1', sessionId: 's1', roleCodes: [], permissionCodes: [] } as any,
      request as any,
      response as any,
      'http://localhost:5173',
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'plp_admin_refresh',
      expect.objectContaining({ httpOnly: true, path: '/api/auth/admin' }),
    );
  });

  it('safe error responses do not expose Prisma details or stack traces', () => {
    const logger = { error: jest.fn() };
    const filter = new HttpExceptionFilter(logger as any);
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: 'request-123' }),
        getResponse: () => ({ status }),
      }),
    };
    filter.catch(new Error('Prisma table User failed at C:\\secret\\path'), host as any);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('Prisma');
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret');
  });
});
