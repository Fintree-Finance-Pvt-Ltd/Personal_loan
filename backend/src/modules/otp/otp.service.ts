import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomerEligibilityStatus,
  CustomerOnboardingStatus,
  KycStatus,
  OtpChannel,
  OtpPurpose,
  Prisma,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomInt, randomBytes, createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EmailService } from './email/email.service';
import { SmsService } from './sms/sms.service';
import { deviceLabel } from '../../common/utils/security.utils';

export type SendMobileOtpInput = {
  mobileNumber?: unknown;
  consentGiven?: unknown;
  consentText?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string;
};

export type VerifyMobileOtpInput = {
  mobileNumber?: unknown;
  otp?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string;
};

export type SendEmailOtpInput = {
  customerId?: unknown;
  email?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type VerifyEmailOtpInput = {
  customerId?: unknown;
  email?: unknown;
  otp?: unknown;
};

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  private readonly otpExpiryMinutes: number;
  private readonly maxAttempts: number;
  private readonly resendCooldownSeconds: number;
  private readonly exposeOtpInResponse: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.otpExpiryMinutes = this.readPositiveNumber('OTP_EXPIRY_MINUTES', 5);
    this.maxAttempts = this.readPositiveNumber('OTP_MAX_ATTEMPTS', 5);
    this.resendCooldownSeconds = this.readPositiveNumber(
      'OTP_RESEND_COOLDOWN_SECONDS',
      60,
    );

    this.exposeOtpInResponse =
      this.configService.get<string>('NODE_ENV') !== 'production' &&
      this.configService
        .get<string>('EXPOSE_OTP_IN_RESPONSE', 'false')
        .toLowerCase() === 'true';
  }

  async sendMobileOtp(input: SendMobileOtpInput) {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid request body.');
    }

    const mobileNumber = this.normalizeMobile(
      String(input.mobileNumber || ''),
    );

    if (input.consentGiven !== true) {
      throw new BadRequestException('Customer consent is required.');
    }

    const consentText =
      typeof input.consentText === 'string'
        ? input.consentText.trim().slice(0, 500)
        : null;

    const ipAddress =
      typeof input.ipAddress === 'string'
        ? input.ipAddress.slice(0, 45)
        : null;

    const userAgent =
      typeof input.userAgent === 'string'
        ? input.userAgent.slice(0, 500)
        : null;

    await this.enforceResendCooldown({
      mobileNumber,
      purpose: OtpPurpose.MOBILE_VERIFICATION,
    });

    const customer = await this.prisma.customer.findUnique({
      where: {
        mobileNumber,
      },
      select: {
        id: true,
        accountStatus: true,
      },
    });

    if (customer?.accountStatus === 'BLOCKED') {
      throw new UnauthorizedException('This customer account is blocked.');
    }

    await this.invalidateActiveSessions({
      mobileNumber,
      purpose: OtpPurpose.MOBILE_VERIFICATION,
    });

    const otp = this.generateOtp();
    const otpHash = await this.hashOtp(otp);
    const now = new Date();
    const expiresAt = this.getOtpExpiry(now);

    const otpSession = await this.prisma.otpSession.create({
      data: {
        customerId: customer?.id || null,
        mobileNumber,
        purpose: OtpPurpose.MOBILE_VERIFICATION,
        channel: OtpChannel.SMS,
        otpHash,
        expiresAt,
        lastSentAt: now,
        maxAttempts: this.maxAttempts,
        consentGiven: true,
        consentText,
        consentAt: now,
        ipAddress,
        userAgent,
      },
    });

    try {
      const smsResult = await this.smsService.sendOtp(mobileNumber, otp);

      return {
        success: true,
        message: 'OTP sent successfully.',
        data: {
          otpSessionId: otpSession.id.toString(),
          expiresAt,
          resendAfterSeconds: this.resendCooldownSeconds,
          simulated: smsResult?.simulated === true,

          ...(this.exposeOtpInResponse
            ? {
                developmentOtp: otp,
              }
            : {}),
        },
      };
    } catch (error) {
      await this.prisma.otpSession.update({
        where: {
          id: otpSession.id,
        },
        data: {
          invalidatedAt: new Date(),
        },
      });

      throw error;
    }
  }

  async verifyMobileOtp(input: VerifyMobileOtpInput) {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid request body.');
    }

    const mobileNumber = this.normalizeMobile(
      String(input.mobileNumber || ''),
    );

    const otp = String(input.otp || '').replace(/\D/g, '');

    if (!/^[0-9]{6}$/.test(otp)) {
      throw new BadRequestException('OTP must contain exactly 6 digits.');
    }

    const session = await this.getActiveOtpSession({
      mobileNumber,
      purpose: OtpPurpose.MOBILE_VERIFICATION,
    });

    await this.validateOtpSession(session, otp);

    try {
      const customer = await this.prisma.$transaction(async (transaction) => {
        const now = new Date();

        const existingCustomer = await transaction.customer.findUnique({
          where: {
            mobileNumber,
          },
        });

        if (existingCustomer?.accountStatus === 'BLOCKED') {
          throw new UnauthorizedException('This customer account is blocked.');
        }

        const verifiedCustomer = await transaction.customer.upsert({
          where: {
            mobileNumber,
          },
          update: {
            mobileVerified: true,
            mobileVerifiedAt: existingCustomer?.mobileVerifiedAt || now,
            lastLoginAt: now,
            lastActivityAt: now,
          },
          create: {
            customerCode: this.generateCustomerCode(),
            countryCode: '+91',
            mobileNumber,
            mobileVerified: true,
            mobileVerifiedAt: now,
            onboardingStatus: CustomerOnboardingStatus.MOBILE_VERIFIED,
            eligibilityStatus: CustomerEligibilityStatus.NOT_CHECKED,
            lastLoginAt: now,
            lastActivityAt: now,
          },
        });

        await transaction.otpSession.update({
          where: {
            id: session.id,
          },
          data: {
            customerId: verifiedCustomer.id,
            verified: true,
            verifiedAt: now,
            attempts: session.attempts + 1,
          },
        });

        await transaction.otpSession.updateMany({
          where: {
            mobileNumber,
            purpose: OtpPurpose.MOBILE_VERIFICATION,
            id: {
              not: session.id,
            },
            verified: false,
            invalidatedAt: null,
          },
          data: {
            invalidatedAt: now,
          },
        });

        const sessionLengthHours = this.configService.get<number>('REFRESH_SESSION_HOURS', 168);
        const idleLengthMins = this.configService.get<number>('REFRESH_IDLE_TIMEOUT_MINUTES', 30);
        const absoluteExpiresAt = new Date(now.getTime() + sessionLengthHours * 3600000);
        const idleExpiresAt = new Date(now.getTime() + idleLengthMins * 60000);

        const customerSession = await transaction.customerSession.create({
          data: {
            customerId: verifiedCustomer.id,
            absoluteExpiresAt,
            idleExpiresAt,
            ipAddress: input.ipAddress?.slice(0, 64),
            userAgent: input.userAgent?.slice(0, 512),
            deviceLabel: deviceLabel(input.userAgent),
            requestId: input.requestId || 'unknown',
          }
        });

        const rawRefreshToken = randomBytes(48).toString('base64url');
        const refreshHash = createHash('sha256').update(rawRefreshToken).digest('hex');

        await transaction.customerRefreshToken.create({
          data: {
            sessionId: customerSession.id,
            tokenHash: refreshHash,
            expiresAt: absoluteExpiresAt
          }
        });

        const accessToken = await this.jwt.signAsync({
            sub: verifiedCustomer.id.toString(),
            sid: customerSession.id,
            type: 'customer-access',
        }, {
            secret: this.configService.getOrThrow<string>('CUSTOMER_JWT_ACCESS_SECRET'),
            expiresIn: this.configService.getOrThrow<string>('CUSTOMER_JWT_ACCESS_EXPIRES_IN') as any,
            issuer: this.configService.getOrThrow<string>('JWT_ISSUER'),
            audience: 'personal-loan-customer',
        });

        return { verifiedCustomer, accessToken, rawRefreshToken };
      });

      this.logger.log(
        `Mobile verified for customer ${customer.verifiedCustomer.customerCode}, mobile ending ${mobileNumber.slice(-4)}.`,
      );

      return {
        success: true,
        message: 'Mobile number verified successfully.',
        refreshToken: customer.rawRefreshToken,
        data: {
          accessToken: customer.accessToken,
          customer: {
            id: customer.verifiedCustomer.id.toString(),
            customerCode: customer.verifiedCustomer.customerCode,
            countryCode: customer.verifiedCustomer.countryCode,
            mobileNumber: customer.verifiedCustomer.mobileNumber,
            mobileVerified: customer.verifiedCustomer.mobileVerified,
            accountStatus: customer.verifiedCustomer.accountStatus,
            onboardingStatus: customer.verifiedCustomer.onboardingStatus,
            eligibilityStatus: customer.verifiedCustomer.eligibilityStatus,
            fullName: customer.verifiedCustomer.fullName,
            email: customer.verifiedCustomer.email,
            emailVerified: customer.verifiedCustomer.emailVerified,
            panVerified: customer.verifiedCustomer.panVerified,
          },
        },
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A customer with this mobile number already exists.',
        );
      }

      throw error;
    }
  }

  async sendEmailOtp(input: SendEmailOtpInput) {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid request body.');
    }

    const customerId = this.parseCustomerId(String(input.customerId || ''));
    const email = this.normalizeEmail(String(input.email || ''));

    const ipAddress =
      typeof input.ipAddress === 'string'
        ? input.ipAddress.slice(0, 45)
        : null;

    const userAgent =
      typeof input.userAgent === 'string'
        ? input.userAgent.slice(0, 500)
        : null;

    const customer = await this.prisma.customer.findUnique({
      where: {
        id: customerId,
      },
      select: {
        id: true,
        accountStatus: true,
        email: true,
        emailVerified: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    if (customer.accountStatus === 'BLOCKED') {
      throw new UnauthorizedException('This customer account is blocked.');
    }

    if (customer.emailVerified && customer.email === email) {
      return {
        success: true,
        message: 'This email address is already verified.',
        data: {
          alreadyVerified: true,
          email,
        },
      };
    }

    await this.enforceResendCooldown({
      customerId,
      emailId: email,
      purpose: OtpPurpose.EMAIL_VERIFICATION,
    });

    await this.invalidateActiveSessions({
      customerId,
      purpose: OtpPurpose.EMAIL_VERIFICATION,
    });

    const otp = this.generateOtp();
    const otpHash = await this.hashOtp(otp);
    const now = new Date();
    const expiresAt = this.getOtpExpiry(now);

    const otpSession = await this.prisma.otpSession.create({
      data: {
        customerId,
        emailId: email,
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        channel: OtpChannel.EMAIL,
        otpHash,
        expiresAt,
        lastSentAt: now,
        maxAttempts: this.maxAttempts,
        ipAddress,
        userAgent,
      },
    });

    try {
      await this.emailService.sendOtp(email, otp);

      return {
        success: true,
        message: 'Email verification OTP sent successfully.',
        data: {
          otpSessionId: otpSession.id.toString(),
          expiresAt,
          resendAfterSeconds: this.resendCooldownSeconds,

          ...(this.exposeOtpInResponse
            ? {
                developmentOtp: otp,
              }
            : {}),
        },
      };
    } catch (error) {
      await this.prisma.otpSession.update({
        where: {
          id: otpSession.id,
        },
        data: {
          invalidatedAt: new Date(),
        },
      });

      throw new ServiceUnavailableException(
        'Unable to send email OTP. Please try again.',
      );
    }
  }

  async verifyEmailOtp(input: VerifyEmailOtpInput) {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid request body.');
    }

    const customerId = this.parseCustomerId(String(input.customerId || ''));
    const email = this.normalizeEmail(String(input.email || ''));
    const otp = String(input.otp || '').replace(/\D/g, '');

    if (!/^[0-9]{6}$/.test(otp)) {
      throw new BadRequestException('OTP must contain exactly 6 digits.');
    }

    const customer = await this.prisma.customer.findUnique({
      where: {
        id: customerId,
      },
      select: {
        id: true,
        accountStatus: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    if (customer.accountStatus === 'BLOCKED') {
      throw new UnauthorizedException('This customer account is blocked.');
    }

    const session = await this.getActiveOtpSession({
      customerId,
      emailId: email,
      purpose: OtpPurpose.EMAIL_VERIFICATION,
    });

    await this.validateOtpSession(session, otp);

    const now = new Date();

    const updatedCustomer = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.otpSession.update({
          where: {
            id: session.id,
          },
          data: {
            verified: true,
            verifiedAt: now,
            attempts: session.attempts + 1,
          },
        });

        await transaction.otpSession.updateMany({
          where: {
            customerId,
            purpose: OtpPurpose.EMAIL_VERIFICATION,
            id: {
              not: session.id,
            },
            verified: false,
            invalidatedAt: null,
          },
          data: {
            invalidatedAt: now,
          },
        });

        const customer = await transaction.customer.update({
          where: {
            id: customerId,
          },
          data: {
            email,
            emailVerified: true,
            emailVerifiedAt: now,
            onboardingStatus: CustomerOnboardingStatus.EMAIL_VERIFIED,
            lastActivityAt: now,
          },
        });

        // Upsert KycVerificationStatus to record email verification
        await transaction.kycVerificationStatus.upsert({
          where: {
            customerId,
          },
          create: {
            customerId,
            emailStatus: KycStatus.VERIFIED,
            emailApiRequest: JSON.stringify({ email, verifiedAt: now.toISOString() }),
            emailApiResponse: JSON.stringify({ status: 'VERIFIED', verifiedAt: now.toISOString() }),
          },
          update: {
            emailStatus: KycStatus.VERIFIED,
            emailApiRequest: JSON.stringify({ email, verifiedAt: now.toISOString() }),
            emailApiResponse: JSON.stringify({ status: 'VERIFIED', verifiedAt: now.toISOString() }),
          },
        });

        return customer;
      },
    );

    this.logger.log(
      `Email verified for customer ${updatedCustomer.customerCode}.`,
    );

    return {
      success: true,
      message: 'Email verified successfully.',
      data: {
        customer: {
          id: updatedCustomer.id.toString(),
          customerCode: updatedCustomer.customerCode,
          email: updatedCustomer.email,
          emailVerified: updatedCustomer.emailVerified,
          onboardingStatus: updatedCustomer.onboardingStatus,
        },
      },
    };
  }

  private async enforceResendCooldown(input: {
    purpose: OtpPurpose;
    mobileNumber?: string;
    customerId?: bigint;
    emailId?: string;
  }): Promise<void> {
    const latestSession = await this.prisma.otpSession.findFirst({
      where: {
        purpose: input.purpose,
        mobileNumber: input.mobileNumber,
        customerId: input.customerId,
        emailId: input.emailId,
      },
      orderBy: {
        lastSentAt: 'desc',
      },
    });

    if (!latestSession) {
      return;
    }

    const secondsElapsed = Math.floor(
      (Date.now() - latestSession.lastSentAt.getTime()) / 1000,
    );

    if (secondsElapsed < this.resendCooldownSeconds) {
      throw new HttpException(
        `Please wait ${
          this.resendCooldownSeconds - secondsElapsed
        } seconds before requesting another OTP.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async invalidateActiveSessions(input: {
    purpose: OtpPurpose;
    mobileNumber?: string;
    customerId?: bigint;
  }): Promise<void> {
    await this.prisma.otpSession.updateMany({
      where: {
        purpose: input.purpose,
        mobileNumber: input.mobileNumber,
        customerId: input.customerId,
        verified: false,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: new Date(),
      },
    });
  }

  private async getActiveOtpSession(input: {
    purpose: OtpPurpose;
    mobileNumber?: string;
    customerId?: bigint;
    emailId?: string;
  }) {
    const session = await this.prisma.otpSession.findFirst({
      where: {
        purpose: input.purpose,
        mobileNumber: input.mobileNumber,
        customerId: input.customerId,
        emailId: input.emailId,
        verified: false,
        invalidatedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!session) {
      throw new BadRequestException('No active OTP session was found.');
    }

    return session;
  }

  private async validateOtpSession(
    session: {
      id: bigint;
      otpHash: string;
      expiresAt: Date;
      attempts: number;
      maxAttempts: number;
      invalidatedAt: Date | null;
      verified: boolean;
    },
    enteredOtp: string,
  ): Promise<void> {
    if (session.verified || session.invalidatedAt) {
      throw new BadRequestException('This OTP session is no longer active.');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.otpSession.update({
        where: {
          id: session.id,
        },
        data: {
          invalidatedAt: new Date(),
        },
      });

      throw new UnauthorizedException(
        'OTP has expired. Please request a new OTP.',
      );
    }

    if (session.attempts >= session.maxAttempts) {
      await this.prisma.otpSession.update({
        where: {
          id: session.id,
        },
        data: {
          invalidatedAt: new Date(),
        },
      });

      throw new HttpException(
        'Maximum OTP attempts exceeded. Please request a new OTP.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otpMatches = await argon2.verify(session.otpHash, enteredOtp);

    if (otpMatches) {
      return;
    }

    const newAttempts = session.attempts + 1;
    const exhausted = newAttempts >= session.maxAttempts;

    await this.prisma.otpSession.update({
      where: {
        id: session.id,
      },
      data: {
        attempts: newAttempts,
        invalidatedAt: exhausted ? new Date() : null,
      },
    });

    throw new UnauthorizedException(
      exhausted
        ? 'Maximum OTP attempts exceeded. Please request a new OTP.'
        : `Invalid OTP. ${
            session.maxAttempts - newAttempts
          } attempt(s) remaining.`,
    );
  }

  private generateOtp(): string {
    return randomInt(100000, 1000000).toString();
  }

  private async hashOtp(otp: string): Promise<string> {
    return argon2.hash(otp, {
      type: argon2.argon2id,
    });
  }

  private getOtpExpiry(from: Date): Date {
    return new Date(from.getTime() + this.otpExpiryMinutes * 60 * 1000);
  }

  private normalizeMobile(mobileNumber: string): string {
    const digits = mobileNumber.replace(/\D/g, '');

    const normalized =
      digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : digits;

    if (!/^[6-9][0-9]{9}$/.test(normalized)) {
      throw new BadRequestException('Enter a valid Indian mobile number.');
    }

    return normalized;
  }

  private normalizeEmail(email: string): string {
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException('Enter a valid email address.');
    }

    return normalizedEmail;
  }

  private parseCustomerId(customerId: string): bigint {
    if (!/^[1-9][0-9]*$/.test(customerId)) {
      throw new BadRequestException('Invalid customer ID.');
    }

    return BigInt(customerId);
  }

  private generateCustomerCode(): string {
    const datePart = new Date()
      .toISOString()
      .slice(2, 10)
      .replaceAll('-', '');

    const randomPart = randomBytes(3).toString('hex').toUpperCase();

    return `CUS-${datePart}-${randomPart}`;
  }

  private readPositiveNumber(key: string, defaultValue: number): number {
    const value = Number(
      this.configService.get<string>(key, String(defaultValue)),
    );

    if (!Number.isFinite(value) || value <= 0) {
      return defaultValue;
    }

    return value;
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private invalidRefresh(): never {
    throw new UnauthorizedException({
      error: { code: 'AUTH_REFRESH_INVALID', message: 'Your session is no longer valid.' },
    });
  }

  async refreshCustomerSession(rawToken: string, userAgent: string | null, ipAddress: string | null) {
    const tokenHash = this.hashRefreshToken(rawToken);
    const token = await this.prisma.customerRefreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        usedAt: true,
        revokedAt: true,
        expiresAt: true,
        session: {
          select: {
            id: true,
            revokedAt: true,
            absoluteExpiresAt: true,
            idleExpiresAt: true,
            customer: {
              select: {
                id: true,
                customerCode: true,
                mobileNumber: true,
                accountStatus: true,
              }
            }
          }
        }
      }
    });

    if (!token) this.invalidRefresh();

    const now = new Date();
    
    // Check if token was already used (replay/compromise)
    if (token.usedAt) {
      // A browser can issue a second refresh during React StrictMode startup
      // before it has applied the rotated cookie. Do not revoke the whole
      // session for this short, legitimate race; an older replay is still
      // treated as compromise below.
      if (now.getTime() - token.usedAt.getTime() <= 5_000) {
        this.invalidRefresh();
      }

      await this.prisma.customerSession.update({
        where: { id: token.session.id },
        data: { revokedAt: now, revokedReason: 'REFRESH_TOKEN_REUSE' }
      });
      await this.prisma.customerRefreshToken.updateMany({
        where: { sessionId: token.session.id, revokedAt: null },
        data: { revokedAt: now }
      });
      this.invalidRefresh();
    }

    if (token.revokedAt || token.expiresAt < now) this.invalidRefresh();

    const session = token.session;
    if (session.revokedAt || session.absoluteExpiresAt < now || session.idleExpiresAt < now) {
      this.invalidRefresh();
    }

    if (session.customer.accountStatus !== 'ACTIVE') {
      this.invalidRefresh();
    }

    const replacement = randomBytes(48).toString('base64url');
    const replacementHash = this.hashRefreshToken(replacement);
    
    const idleLengthMins = this.configService.get<number>('REFRESH_IDLE_TIMEOUT_MINUTES', 30);
    const newIdleExpiresAt = new Date(now.getTime() + idleLengthMins * 60000);

    const rotated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.customerRefreshToken.updateMany({
        where: { id: token.id, usedAt: null, revokedAt: null },
        data: { usedAt: now }
      });

      if (claimed.count !== 1) return false;

      await tx.customerRefreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: replacementHash,
          parentTokenId: token.id,
          expiresAt: session.absoluteExpiresAt
        }
      });

      await tx.customerSession.update({
        where: { id: session.id },
        data: {
          idleExpiresAt: newIdleExpiresAt,
          lastSeenAt: now,
          ipAddress: ipAddress?.slice(0, 64),
          userAgent: userAgent?.slice(0, 512),
        }
      });

      return true;
    });

    if (!rotated) this.invalidRefresh();

    const accessToken = await this.jwt.signAsync({
      sub: session.customer.id.toString(),
      sid: session.id,
      type: 'customer-access',
    }, {
      secret: this.configService.getOrThrow<string>('CUSTOMER_JWT_ACCESS_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('CUSTOMER_JWT_ACCESS_EXPIRES_IN') as any,
      issuer: this.configService.getOrThrow<string>('JWT_ISSUER'),
      audience: 'personal-loan-customer',
    });

    return {
      accessToken,
      refreshToken: replacement,
      customer: {
        id: session.customer.id.toString(),
        customerCode: session.customer.customerCode,
        mobileNumber: session.customer.mobileNumber,
      }
    };
  }

  async revokeCustomerSessionByToken(rawToken: string) {
    try {
      const tokenHash = this.hashRefreshToken(rawToken);
      const token = await this.prisma.customerRefreshToken.findUnique({
        where: { tokenHash },
        select: { sessionId: true }
      });

      if (token) {
        await this.prisma.customerSession.update({
          where: { id: token.sessionId },
          data: { revokedAt: new Date(), revokedReason: 'LOGOUT' }
        });
      }
    } catch (e) {
      // Ignore errors on logout
    }
  }

  getCookieName(): string {
    return this.configService.getOrThrow<string>('CUSTOMER_COOKIE_NAME');
  }

  getCookieOptions(): any {
    const isProd = this.configService.get('NODE_ENV') === 'production';
    const maxAgeHours = this.configService.get<number>('REFRESH_SESSION_HOURS', 168);
    const apiPrefix = this.configService.get<string>('API_PREFIX', 'api');
    const secure = this.configService.get<boolean>('COOKIE_SECURE', false) || isProd;
    const sameSite = this.configService.get<'strict' | 'lax' | 'none'>('COOKIE_SAME_SITE', 'strict');

    return {
      httpOnly: true,
      secure,
      sameSite,
      path: `/${apiPrefix}/customer/auth`,
      maxAge: maxAgeHours * 3600000,
    };
  }

  getLegacyCookiePaths(): string[] {
    const apiPrefix = this.configService.get<string>('API_PREFIX', 'api');
    return [`/${apiPrefix}/customer`];
  }
}
