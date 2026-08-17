import { BadRequestException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  let service: OtpService;
  let prisma: any;
  let smsService: any;
  let emailService: any;
  let config: any;
  let jwt: any;

  const CONFIG_VALUES: Record<string, unknown> = {
    CUSTOMER_JWT_ACCESS_SECRET: 'd'.repeat(32),
    CUSTOMER_JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_ISSUER: 'personal-loan-platform',
    CUSTOMER_COOKIE_NAME: 'plp_customer_refresh',
    API_PREFIX: 'api',
  };

  const OTP = '654321';
  let otpHash: string;

  beforeAll(async () => {
    otpHash = await argon2.hash(OTP, { type: argon2.argon2id });
  });

  beforeEach(() => {
    prisma = {
      customer: { findUnique: jest.fn(), upsert: jest.fn() },
      otpSession: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      customerSession: { create: jest.fn(), update: jest.fn() },
      customerRefreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
      // OtpService only ever uses the callback form of $transaction.
      $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    };

    smsService = { sendOtp: jest.fn().mockResolvedValue({ simulated: false }) };
    emailService = { sendOtp: jest.fn().mockResolvedValue(undefined) };

    config = {
      get: jest.fn((key: string, defaultValue?: any) => (key in CONFIG_VALUES ? CONFIG_VALUES[key] : defaultValue)),
      getOrThrow: jest.fn((key: string) => {
        if (!(key in CONFIG_VALUES)) throw new Error(`OtpService requested unmocked config key in test: ${key}`);
        return CONFIG_VALUES[key];
      }),
    };

    jwt = { signAsync: jest.fn().mockResolvedValue('signed.customer.jwt') };

    service = new OtpService(prisma, smsService, emailService, config, jwt);
  });

  describe('sendMobileOtp', () => {
    it('rejects a blocked customer', async () => {
      prisma.otpSession.findFirst.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue({ id: 1n, accountStatus: 'BLOCKED' });

      await expect(
        service.sendMobileOtp({ mobileNumber: '9876543210', consentGiven: true }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('enforces the resend cooldown against the most recent OTP for this number', async () => {
      prisma.otpSession.findFirst.mockResolvedValue({ lastSentAt: new Date() });

      const err: any = await service
        .sendMobileOtp({ mobileNumber: '9876543210', consentGiven: true })
        .catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(prisma.otpSession.create).not.toHaveBeenCalled();
    });

    it('sends an OTP and opens a session when there is no cooldown in effect', async () => {
      prisma.otpSession.findFirst.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.otpSession.create.mockResolvedValue({ id: 555n });

      const result = await service.sendMobileOtp({ mobileNumber: '9876543210', consentGiven: true });

      expect(result.success).toBe(true);
      expect(result.data.otpSessionId).toBe('555');
      expect(smsService.sendOtp).toHaveBeenCalledWith('9876543210', expect.any(String));
    });

    it('invalidates the OTP session it just created if the SMS provider throws', async () => {
      prisma.otpSession.findFirst.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.otpSession.create.mockResolvedValue({ id: 555n });
      smsService.sendOtp.mockRejectedValue(new Error('SMS provider down'));

      await expect(
        service.sendMobileOtp({ mobileNumber: '9876543210', consentGiven: true }),
      ).rejects.toThrow('SMS provider down');

      expect(prisma.otpSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 555n },
          data: expect.objectContaining({ invalidatedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('verifyMobileOtp', () => {
    const activeSession = (overrides: any = {}) => ({
      id: 555n,
      otpHash,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      attempts: 0,
      maxAttempts: 5,
      invalidatedAt: null,
      verified: false,
      ...overrides,
    });

    it('rejects when there is no active OTP session for this number', async () => {
      prisma.otpSession.findFirst.mockResolvedValue(null);
      await expect(
        service.verifyMobileOtp({ mobileNumber: '9876543210', otp: OTP }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects and invalidates an expired OTP session', async () => {
      prisma.otpSession.findFirst.mockResolvedValue(activeSession({ expiresAt: new Date(Date.now() - 1_000) }));

      await expect(
        service.verifyMobileOtp({ mobileNumber: '9876543210', otp: OTP }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.otpSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { invalidatedAt: expect.any(Date) } }),
      );
    });

    it('rejects a wrong OTP and reports remaining attempts without locking it out immediately', async () => {
      prisma.otpSession.findFirst.mockResolvedValue(activeSession());

      await expect(
        service.verifyMobileOtp({ mobileNumber: '9876543210', otp: '000000' }),
      ).rejects.toThrow(/attempt/i);
      expect(prisma.otpSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: 1, invalidatedAt: null } }),
      );
    });

    it('locks the OTP session out once attempts reach the configured maximum', async () => {
      prisma.otpSession.findFirst.mockResolvedValue(activeSession({ attempts: 5, maxAttempts: 5 }));

      await expect(
        service.verifyMobileOtp({ mobileNumber: '9876543210', otp: '000000' }),
      ).rejects.toThrow(HttpException);
    });

    it('rejects a blocked customer even with a correct OTP, without ever upserting them', async () => {
      prisma.otpSession.findFirst.mockResolvedValue(activeSession());
      prisma.customer.findUnique.mockResolvedValue({ id: 42n, accountStatus: 'BLOCKED' });

      await expect(
        service.verifyMobileOtp({ mobileNumber: '9876543210', otp: OTP }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.customer.upsert).not.toHaveBeenCalled();
    });

    it('on success, opens a customer session with a ~30-day absolute cap and no separate idle clock', async () => {
      prisma.otpSession.findFirst.mockResolvedValue(activeSession());
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.customer.upsert.mockResolvedValue({
        id: 42n,
        customerCode: 'CUS-1',
        countryCode: '+91',
        mobileNumber: '9876543210',
        mobileVerified: true,
        onboardingStatus: 'MOBILE_VERIFIED',
        eligibilityStatus: 'NOT_CHECKED',
      });
      prisma.customerSession.create.mockResolvedValue({ id: 'cust-session-1' });

      const result = await service.verifyMobileOtp({ mobileNumber: '9876543210', otp: OTP });

      expect(result.success).toBe(true);
      expect(result.data.accessToken).toBe('signed.customer.jwt');

      // CUSTOMER_REFRESH_SESSION_DAYS is intentionally absent from this test's
      // config, so this falls through to the service's own built-in default of
      // 30 days. idleExpiresAt must equal absoluteExpiresAt exactly — customers
      // have no shorter idle clock that can log them out mid-application.
      const sessionData = prisma.customerSession.create.mock.calls[0][0].data;
      const absoluteDays = (sessionData.absoluteExpiresAt.getTime() - Date.now()) / 86_400_000;
      expect(absoluteDays).toBeGreaterThan(29.9);
      expect(absoluteDays).toBeLessThanOrEqual(30);
      expect(sessionData.idleExpiresAt.getTime()).toBe(sessionData.absoluteExpiresAt.getTime());
    });
  });

  describe('refreshCustomerSession', () => {
    const THIRTY_DAYS_MS = 30 * 86_400_000;

    const buildToken = (overrides: any = {}) => {
      const { session: sessionOverrides, ...tokenOverrides } = overrides;
      const absoluteExpiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
      return {
        id: 'rt-1',
        usedAt: null,
        revokedAt: null,
        expiresAt: absoluteExpiresAt,
        ...tokenOverrides,
        session: {
          id: 'cust-session-1',
          revokedAt: null,
          // Customers have no separate idle clock — idleExpiresAt is always
          // pinned to absoluteExpiresAt (see otp.service.ts). Fixture reflects
          // that instead of the old, now-removed 90-minute idle window.
          absoluteExpiresAt,
          idleExpiresAt: absoluteExpiresAt,
          customer: { id: 42n, customerCode: 'CUS-1', mobileNumber: '9876543210', accountStatus: 'ACTIVE' },
          ...sessionOverrides,
        },
      };
    };

    it('rejects an unrecognized refresh token', async () => {
      prisma.customerRefreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refreshCustomerSession('bogus', 'ua', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
    });

    it('tolerates a same-tab double-submit inside the 15s grace window without revoking the session', async () => {
      prisma.customerRefreshToken.findUnique.mockResolvedValue(
        buildToken({ usedAt: new Date(Date.now() - 3_000) }),
      );

      await expect(service.refreshCustomerSession('raced', 'ua', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
      expect(prisma.customerSession.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revokedReason: 'REFRESH_TOKEN_REUSE' }) }),
      );
    });

    it('revokes the whole session when a refresh token is replayed well outside the grace window', async () => {
      prisma.customerRefreshToken.findUnique.mockResolvedValue(
        buildToken({ usedAt: new Date(Date.now() - 60_000) }),
      );

      await expect(service.refreshCustomerSession('stale', 'ua', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
      expect(prisma.customerSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revokedReason: 'REFRESH_TOKEN_REUSE' }) }),
      );
      expect(prisma.customerRefreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sessionId: 'cust-session-1', revokedAt: null } }),
      );
    });

    it('still honors idleExpiresAt as a guard if a row ever has one shorter than its absolute expiry (e.g. a pre-migration row)', async () => {
      prisma.customerRefreshToken.findUnique.mockResolvedValue(
        buildToken({ session: { idleExpiresAt: new Date(Date.now() - 1_000) } }),
      );
      await expect(service.refreshCustomerSession('idle', 'ua', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects once the session has passed its absolute expiry', async () => {
      prisma.customerRefreshToken.findUnique.mockResolvedValue(
        buildToken({ session: { absoluteExpiresAt: new Date(Date.now() - 1_000) } }),
      );
      await expect(service.refreshCustomerSession('expired', 'ua', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the customer account is no longer active', async () => {
      prisma.customerRefreshToken.findUnique.mockResolvedValue(
        buildToken({ session: { customer: { id: 42n, accountStatus: 'BLOCKED' } } }),
      );
      await expect(service.refreshCustomerSession('blocked', 'ua', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
    });

    it('rotates the token without extending or shrinking the original absolute expiry', async () => {
      const token = buildToken();
      prisma.customerRefreshToken.findUnique.mockResolvedValue(token);
      prisma.customerRefreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refreshCustomerSession('good', 'ua', '1.2.3.4');

      expect(result.accessToken).toBe('signed.customer.jwt');
      const sessionUpdateData = prisma.customerSession.update.mock.calls[0][0].data;
      // Rotating the token must not push the absolute cap further out — it stays
      // pinned to whatever was set at login, and idleExpiresAt tracks it exactly.
      expect(sessionUpdateData.idleExpiresAt.getTime()).toBe(token.session.absoluteExpiresAt.getTime());
    });

    it('treats a lost claim race as reuse rather than silently issuing two live sessions', async () => {
      prisma.customerRefreshToken.findUnique.mockResolvedValue(buildToken());
      prisma.customerRefreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refreshCustomerSession('raced-2', 'ua', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('cookie configuration', () => {
    it('scopes the customer refresh cookie to the customer auth path with httpOnly + strict defaults', () => {
      const options = service.getCookieOptions();
      expect(options.httpOnly).toBe(true);
      expect(options.path).toBe('/api/customer/auth');
      expect(options.sameSite).toBe('strict');
    });
  });
});
