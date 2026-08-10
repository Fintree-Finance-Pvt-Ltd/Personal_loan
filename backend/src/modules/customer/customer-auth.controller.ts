import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { OtpService } from '../otp/otp.service';

@Controller('customer/auth')
export class CustomerAuthController {
  constructor(private readonly otpService: OtpService) {}

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const rawToken = request.cookies?.[this.otpService.getCookieName()];
    if (!rawToken) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_REFRESH_INVALID', message: 'Your session is no longer valid.' },
      });
    }

    const result = await this.otpService.refreshCustomerSession(
      rawToken,
      request.headers['user-agent'] || null,
      request.ip || 'unknown'
    );

    const cookieName = this.otpService.getCookieName();
    const cookieOptions = this.otpService.getCookieOptions();

    for (const path of this.otpService.getLegacyCookiePaths()) {
      response.clearCookie(cookieName, {
        httpOnly: cookieOptions.httpOnly,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
        path,
      });
    }

    response.cookie(
      cookieName,
      result.refreshToken,
      cookieOptions
    );

    return {
      success: true,
      message: 'Session refreshed successfully',
      data: {
        accessToken: result.accessToken,
        customer: result.customer,
      }
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const rawToken = request.cookies?.[this.otpService.getCookieName()];
    
    if (rawToken) {
      await this.otpService.revokeCustomerSessionByToken(rawToken);
    }

    // Clear the cookie with exact same options
    const cookieOpts = this.otpService.getCookieOptions();
    response.clearCookie(this.otpService.getCookieName(), {
      path: cookieOpts.path,
      secure: cookieOpts.secure,
      sameSite: cookieOpts.sameSite,
      httpOnly: cookieOpts.httpOnly,
    });

    for (const path of this.otpService.getLegacyCookiePaths()) {
      response.clearCookie(this.otpService.getCookieName(), {
        path,
        secure: cookieOpts.secure,
        sameSite: cookieOpts.sameSite,
        httpOnly: cookieOpts.httpOnly,
      });
    }

    return { success: true, message: 'Logged out successfully' };
  }
}
