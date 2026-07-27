

import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly smtpFrom: string;

  constructor(
    private readonly configService: ConfigService,
  ) {
    const host =
      this.configService.get<string>('SMTP_HOST');

    const port = Number(
      this.configService.get<string>('SMTP_PORT') ||
        587,
    );

    const secure =
      this.configService.get<string>(
        'SMTP_SECURE',
      ) === 'true';

    const user =
      this.configService.get<string>('SMTP_USER');

    const password =
      this.configService.get<string>(
        'SMTP_PASS',
      );

    this.smtpFrom =
      this.configService.get<string>(
        'SMTP_FROM',
      ) || user || '';

    if (!host) {
      throw new Error(
        'SMTP_HOST is missing from environment variables.',
      );
    }

    if (!user) {
      throw new Error(
        'SMTP_USER is missing from environment variables.',
      );
    }

    if (!password) {
      throw new Error(
        'SMTP_PASS is missing from environment variables.',
      );
    }

    this.transporter =
      nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass: password,
        },
      });

    console.log('SMTP configured:', {
      host,
      port,
      secure,
      user,
      hasPassword: Boolean(password),
    });
  }

  async sendOtp(
    email: string,
    otp: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.smtpFrom,
        to: email,
        subject:
          'Fintree LAP Email Verification OTP',
        text: `Your OTP is ${otp}. It is valid for 5 minutes.`,
        html: `
          <div style="font-family:Arial,sans-serif">
            <h2>Email Verification</h2>
            <p>Your OTP is:</p>

            <div style="
              display:inline-block;
              padding:15px 25px;
              font-size:28px;
              font-weight:bold;
              letter-spacing:6px;
              background:#f1f5f9;
              border-radius:8px;
            ">
              ${otp}
            </div>

            <p>This OTP is valid for 5 minutes.</p>
            <p>Do not share this OTP with anyone.</p>
          </div>
        `,
      });
    } catch (error: any) {
      console.error('OTP email sending error:', {
        message: error?.message,
        code: error?.code,
        command: error?.command,
        response: error?.response,
      });

      throw new InternalServerErrorException(
        error?.response ||
          error?.message ||
          'Unable to send OTP email.',
      );
    }
  }
}