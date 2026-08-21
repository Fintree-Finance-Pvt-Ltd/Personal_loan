

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

  async sendWelcomeLetter(
    email: string,
    details: {
      customerName: string;
      lan: string;
      disbursedAmount: number;
      disbursalDate: string;
      firstRepaymentDate: string;
    },
    attachment: { filename: string; content: Buffer },
  ): Promise<void> {
    const amountFormatted = details.disbursedAmount.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    });

    try {
      await this.transporter.sendMail({
        from: this.smtpFrom,
        to: email,
        subject: `Welcome to Fintree — Loan ${details.lan} Disbursed`,
        text: `Dear ${details.customerName},\n\nCongratulations! Your loan (${details.lan}) of ${amountFormatted} has been disbursed on ${details.disbursalDate}. Your first repayment is due on ${details.firstRepaymentDate}.\n\nYour signed loan agreement is attached to this email for your records.\n\nWelcome aboard,\nTeam Fintree`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px">
            <h2>Welcome to Fintree!</h2>
            <p>Dear ${details.customerName},</p>
            <p>Congratulations — your loan has been successfully disbursed. Here are your loan details:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:6px 0;color:#64748b">Loan Account Number</td><td style="padding:6px 0;font-weight:bold">${details.lan}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Disbursed Amount</td><td style="padding:6px 0;font-weight:bold">${amountFormatted}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Disbursal Date</td><td style="padding:6px 0;font-weight:bold">${details.disbursalDate}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">First Repayment Due</td><td style="padding:6px 0;font-weight:bold">${details.firstRepaymentDate}</td></tr>
            </table>
            <p>Your signed loan agreement is attached to this email for your records — please keep it safe.</p>
            <p>Welcome aboard,<br/>Team Fintree</p>
          </div>
        `,
        attachments: [attachment],
      });
    } catch (error: any) {
      console.error('Welcome letter email sending error:', {
        message: error?.message,
        code: error?.code,
        command: error?.command,
        response: error?.response,
      });
      throw error;
    }
  }
}