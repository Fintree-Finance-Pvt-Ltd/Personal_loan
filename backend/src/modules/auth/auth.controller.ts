import {
  Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Req, Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { SessionsService } from '../sessions/sessions.service';
import { SessionIdDto } from '../sessions/dto/session-id.dto';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';
import { EmptyBodyDto } from '../../common/types/empty-body.dto';
import { assertTrustedOrigin } from '../../common/utils/security.utils';

@Controller('auth/admin')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly config: ConfigService,
  ) { }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: AdminLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto, this.context(request));
    this.setRefreshCookie(response, result.refreshToken);
    const { refreshToken: _secret, ...safeResult } = result;
    return safeResult;
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() _body: EmptyBodyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('origin') origin?: string,
    @Headers('referer') referer?: string,
  ) {
    assertTrustedOrigin(this.config.getOrThrow<string>('FRONTEND_URL'), origin, referer);
    const result = await this.auth.refresh(request.cookies?.[this.cookieName()], this.context(request));
    this.setRefreshCookie(response, result.refreshToken);
    const { refreshToken: _secret, ...safeResult } = result;
    return safeResult;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Body() _body: EmptyBodyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('origin') origin?: string,
    @Headers('referer') referer?: string,
  ) {
    assertTrustedOrigin(this.config.getOrThrow<string>('FRONTEND_URL'), origin, referer);
    const result = await this.auth.logout(user, this.context(request));
    response.clearCookie(this.cookieName(), this.cookieOptions());
    return result;
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user);
  }

  @Permissions('SESSION_READ_OWN')
  @Get('sessions')
  sessionsList(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.listOwn(user);
  }

  @Permissions('SESSION_REVOKE_OWN')
  @Delete('sessions/:sessionId')
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SessionIdDto,
    @Req() request: Request,
  ) {
    return this.sessions.revokeOwn(user, params.sessionId, this.context(request));
  }

  @Permissions('SESSION_REVOKE_ALL')
  @Post('sessions/revoke-others')
  @HttpCode(200)
  revokeOthers(
    @Body() _body: EmptyBodyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sessions.revokeOthers(user, this.context(request));
  }

  private context(request: Request) {
    return {
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    };
  }

  private cookieName(): string {
    return this.config.getOrThrow<string>('COOKIE_NAME');
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('COOKIE_SECURE'),
      sameSite: 'strict',
      path: `/${this.config.getOrThrow<string>('API_PREFIX')}/auth/admin`,
      maxAge: this.config.getOrThrow<number>('REFRESH_SESSION_HOURS') * 3_600_000,
    };
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(this.cookieName(), token, this.cookieOptions());
  }
}
