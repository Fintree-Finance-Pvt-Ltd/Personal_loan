import { Injectable, Logger } from '@nestjs/common';
import { randomInt, createHmac, randomBytes } from 'crypto';
import { SmsService } from '../../otp/sms/sms.service';

@Injectable()
export class OtpSignService {
  private readonly logger = new Logger(OtpSignService.name);

  constructor(private readonly smsService: SmsService) {}

  /**
   * Generates a 6-digit secure OTP string
   */
  generateOtp(): string {
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Delivers OTP via SMS Gateway
   */
  async deliverOtp(mobile: string, otp: string): Promise<boolean> {
    try {
      await this.smsService.sendOtp(mobile, otp);
      this.logger.log(`OTP delivered to ${this.maskMobile(mobile)} for agreement eSign.`);
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed sending SMS OTP to ${mobile}: ${err?.message}`);
      return false;
    }
  }

  /**
   * Hashes OTP for secure DB storage
   */
  hashOtp(otp: string): string {
    const salt = process.env.OTP_SIGNING_SALT || 'plp_signing_otp_salt_secret_key_32!';
    return createHmac('sha256', salt).update(String(otp || '').trim()).digest('hex');
  }

  /**
   * Verifies OTP against stored hash
   */
  verifyOtpHash(inputOtp: string, storedHash: string): boolean {
    if (!inputOtp || !storedHash) return false;
    const computed = this.hashOtp(inputOtp);
    return computed === storedHash;
  }

  /**
   * Generates unique OTP session ID
   */
  generateOtpSessionId(lan: string): string {
    const safeLan = String(lan || '').slice(-6);
    const rand = randomBytes(4).toString('hex').toUpperCase();
    return `ESOTP_${safeLan}_${Date.now().toString().slice(-6)}_${rand}`;
  }

  /**
   * Masks mobile number for response
   */
  maskMobile(mobile: string): string {
    const clean = String(mobile || '').replace(/\D/g, '').slice(-10);
    if (clean.length < 10) return 'XXXXXX0000';
    return `${clean.slice(0, 2)}XXXX${clean.slice(-4)}`;
  }
}
