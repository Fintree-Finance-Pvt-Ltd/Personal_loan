import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import {
  OtpService,
  SendMobileOtpInput,
  VerifyMobileOtpInput,
  SendEmailOtpInput,
  VerifyEmailOtpInput,
} from './otp.service';

@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Public()
  @Post('mobile/send')
  @HttpCode(HttpStatus.OK)
  sendMobileOtp(
    @Body() body: Record<string, unknown>,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    const input: SendMobileOtpInput = {
      mobileNumber: body.mobileNumber,
      consentGiven: body.consentGiven,
      consentText: body.consentText,
      ipAddress,
      userAgent: request.headers['user-agent'] || null,
    };

    return this.otpService.sendMobileOtp(input);
  }

  @Public()
  @Post('mobile/verify')
  @HttpCode(HttpStatus.OK)
  verifyMobileOtp(@Body() body: Record<string, unknown>) {
    const input: VerifyMobileOtpInput = {
      mobileNumber: body.mobileNumber,
      otp: body.otp,
    };

    return this.otpService.verifyMobileOtp(input);
  }

  @Public()
  @Post('email/send')
  @HttpCode(HttpStatus.OK)
  sendEmailOtp(
    @Body() body: Record<string, unknown>,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    const input: SendEmailOtpInput = {
      customerId: body.customerId,
      email: body.email,
      ipAddress,
      userAgent: request.headers['user-agent'] || null,
    };

    return this.otpService.sendEmailOtp(input);
  }

  @Public()
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  verifyEmailOtp(@Body() body: Record<string, unknown>) {
    const input: VerifyEmailOtpInput = {
      customerId: body.customerId,
      email: body.email,
      otp: body.otp,
    };

    return this.otpService.verifyEmailOtp(input);
  }
}