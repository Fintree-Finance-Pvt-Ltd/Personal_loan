import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
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
  async verifyMobileOtp(
    @Body() body: Record<string, unknown>,
    @Ip() ipAddress: string,
    @Req() request: Request,
    @Res({ passthrough: true }) res: any,
  ) {
    const input: VerifyMobileOtpInput = {
      mobileNumber: body.mobileNumber,
      otp: body.otp,
      ipAddress,
      userAgent: request.headers['user-agent'] || null,
      requestId: request.headers['x-request-id'] as string || 'test-req-id', // Assuming request ID is handled by middleware
    };

    const result = await this.otpService.verifyMobileOtp(input);
    
    if ((result as any).refreshToken) {
      const cookieName = this.otpService.getCookieName();
      const cookieOptions = this.otpService.getCookieOptions();

      for (const path of this.otpService.getLegacyCookiePaths()) {
        res.clearCookie(cookieName, {
          httpOnly: cookieOptions.httpOnly,
          secure: cookieOptions.secure,
          sameSite: cookieOptions.sameSite,
          path,
        });
      }

      res.cookie(
        cookieName,
        (result as any).refreshToken,
        cookieOptions
      );
      // Remove refreshToken from response body so it's only in HttpOnly cookie
      delete (result as any).refreshToken;
    }

    return result;
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
