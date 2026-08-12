import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  UnaportLoginResponse,
  UnaportRefreshTokenResponse,
} from './unaport.types';

interface CachedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // Unix timestamp (ms)
  refreshTokenExpiresAt: number; // Unix timestamp (ms)
}

@Injectable()
export class UnaportTokenService {
  private readonly logger = new Logger(UnaportTokenService.name);
  private cachedTokens: CachedTokens | null = null;
  private tokenRefreshPromise: Promise<{ accessToken: string; refreshToken: string }> | null = null;
  private readonly httpClient: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const timeout = Number(
      this.configService.get<string>('UNAPORT_HTTP_TIMEOUT_MS') || '15000',
    );
    this.httpClient = axios.create({
      timeout: isNaN(timeout) ? 15000 : timeout,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  private getBaseUrl(): string {
    const url = this.configService.get<string>('UNAPORT_BASE_URL');
    if (!url) {
      throw new InternalServerErrorException(
        'UNAPORT_BASE_URL environment variable is not configured.',
      );
    }
    return url.replace(/\/+$/, '');
  }

  private getCredentials(): { emailId: string; password: string } {
    const emailId = this.configService.get<string>('UNAPORT_EMAIL');
    const password = this.configService.get<string>('UNAPORT_PASSWORD');

    if (!emailId || !password) {
      throw new InternalServerErrorException(
        'UNAPORT_EMAIL or UNAPORT_PASSWORD environment variable is missing.',
      );
    }
    return { emailId, password };
  }

  /**
   * Retrieves valid Unaport access and refresh tokens.
   * Reuses cached tokens if valid. Auto-refreshes or re-logins as needed.
   * Single-flight mutex lock guarantees concurrent callers await the same promise.
   */
  async getValidTokens(): Promise<{ accessToken: string; refreshToken: string }> {
    const now = Date.now();
    const SAFETY_BUFFER_MS = 60 * 1000; // 60 seconds prior buffer

    // Check if current cached access token is valid
    if (
      this.cachedTokens &&
      this.cachedTokens.accessTokenExpiresAt > now + SAFETY_BUFFER_MS
    ) {
      return {
        accessToken: this.cachedTokens.accessToken,
        refreshToken: this.cachedTokens.refreshToken,
      };
    }

    // If already refreshing or logging in, join existing promise
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = (async () => {
      try {
        // If refresh token is present and not expired, attempt refresh
        if (
          this.cachedTokens &&
          this.cachedTokens.refreshTokenExpiresAt > now + SAFETY_BUFFER_MS
        ) {
          try {
            this.logger.log({
              event: 'unaport_token_refresh_attempt',
              status: 'IN_PROGRESS',
            });
            const refreshed = await this.refreshToken(this.cachedTokens.refreshToken);
            this.logger.log({
              event: 'unaport_token_refresh_success',
              status: 'SUCCESS',
            });
            return refreshed;
          } catch (err: any) {
            this.logger.warn({
              event: 'unaport_token_refresh_failed',
              error: err?.message || 'Refresh failed, fallback to login',
            });
            // Fallthrough to login
          }
        }

        // Perform fresh login
        this.logger.log({
          event: 'unaport_login_attempt',
          status: 'IN_PROGRESS',
        });
        const loggedIn = await this.login();
        this.logger.log({
          event: 'unaport_login_success',
          status: 'SUCCESS',
        });
        return loggedIn;
      } finally {
        this.tokenRefreshPromise = null;
      }
    })();

    return this.tokenRefreshPromise;
  }

  /**
   * Perform login using UNAPORT_EMAIL and UNAPORT_PASSWORD
   */
  private async login(): Promise<{ accessToken: string; refreshToken: string }> {
    const baseUrl = this.getBaseUrl();
    const { emailId, password } = this.getCredentials();
    const url = `${baseUrl}/public/user/login`;

    try {
      console.log(`[AA TOKEN SERVICE] [CALL] Unaport login POST ${url} - emailId: ${emailId}`);
      const response = await this.httpClient.post<UnaportLoginResponse>(url, {
        emailId,
        password,
      });

      const data = response.data;
      if (!data?.access_token || !data?.refresh_token) {
        throw new Error('Unaport login response did not contain access_token or refresh_token.');
      }

      this.updateTokenCache(data.access_token, data.refresh_token, data.expires_in, data.refresh_expires_in);

      console.log(`[AA TOKEN SERVICE] [RESPONSE] Unaport login success - acquired access_token & refresh_token`);
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      };
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || 'Unknown authentication error';
      this.logger.error({
        event: 'unaport_login_error',
        status: error?.response?.status || 500,
        errorMessage,
      });
      throw new InternalServerErrorException(`Unaport authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Refresh token using Unaport Refresh Token API
   */
  private async refreshToken(currentRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/public/user/refreshToken`;

    try {
      console.log(`[AA TOKEN SERVICE] [CALL] Unaport refreshToken POST ${url}`);
      const response = await this.httpClient.post<UnaportRefreshTokenResponse>(url, {
        refresh_token: currentRefreshToken,
      });

      const data = response.data;
      if (!data?.access_token || !data?.refresh_token) {
        throw new Error('Unaport token refresh response missing tokens.');
      }

      this.updateTokenCache(data.access_token, data.refresh_token, data.expires_in, data.refresh_expires_in);

      console.log(`[AA TOKEN SERVICE] [RESPONSE] Unaport refreshToken success - acquired updated access_token & refresh_token`);
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      };
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || 'Refresh token failed';
      this.logger.warn({
        event: 'unaport_refresh_token_error',
        status: error?.response?.status || 500,
        errorMessage,
      });
      throw error;
    }
  }

  private updateTokenCache(
    accessToken: string,
    refreshToken: string,
    expiresInSeconds: number = 600,
    refreshExpiresInSeconds: number = 1800,
  ): void {
    const now = Date.now();
    this.cachedTokens = {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: now + (expiresInSeconds || 600) * 1000,
      refreshTokenExpiresAt: now + (refreshExpiresInSeconds || 1800) * 1000,
    };
  }

  /**
   * Helper to clear cached token (e.g. for testing)
   */
  clearCache(): void {
    this.cachedTokens = null;
    this.tokenRefreshPromise = null;
  }
}
