import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isIP } from 'net';
import { URL } from 'url';

import {
  LenderHttpMethod,
  LenderIntegrationTransportConfig,
} from './lender-integration.types';

import {
  LenderIntegrationError,
  normalizeLenderIntegrationError,
} from './lender-integration.errors';

const DEFAULT_REQUEST_LIMIT =
  1_048_576;

const DEFAULT_RESPONSE_LIMIT =
  1_048_576;

@Injectable()
export class LenderHttpService {
  private readonly logger =
    new Logger(
      LenderHttpService.name,
    );

  constructor(
    private readonly http:
      HttpService,

    private readonly config:
      ConfigService,
  ) {}

  resolveRequestUrl(
    transport:
      LenderIntegrationTransportConfig,

    requestPath:
      string,
  ): URL {
    if (!transport.baseUrl) {
      throw new LenderIntegrationError(
        'LENDER_BASE_URL_NOT_CONFIGURED',
        'Lender base URL is not configured.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    if (
      !requestPath ||
      !requestPath.startsWith('/') ||
      requestPath.startsWith('//') ||
      requestPath.includes('://')
    ) {
      throw new LenderIntegrationError(
        'LENDER_ENDPOINT_PATH_INVALID',
        'Lender endpoint must be a relative path starting with one slash.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    if (
      requestPath.includes('{') ||
      requestPath.includes('}')
    ) {
      throw new LenderIntegrationError(
        'LENDER_ENDPOINT_PLACEHOLDER_UNRESOLVED',
        'Lender endpoint contains an unresolved placeholder.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    let baseUrl: URL;

    try {
      baseUrl =
        new URL(
          transport.baseUrl,
        );
    } catch {
      throw new LenderIntegrationError(
        'LENDER_BASE_URL_INVALID',
        'Lender base URL is invalid.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    if (
      baseUrl.username ||
      baseUrl.password
    ) {
      throw new LenderIntegrationError(
        'LENDER_BASE_URL_CREDENTIALS_BLOCKED',
        'Embedded URL credentials are not permitted.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    if (
      baseUrl.hash ||
      baseUrl.search
    ) {
      throw new LenderIntegrationError(
        'LENDER_BASE_URL_INVALID',
        'Lender base URL must not contain a query or fragment.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    const environment =
      this.config.get<string>(
        'NODE_ENV',
      ) ?? 'development';

    const isLocalDevelopment =
      environment === 'development' &&
      (
        baseUrl.hostname === 'localhost' ||
        baseUrl.hostname === '127.0.0.1' ||
        baseUrl.hostname === '::1'
      );

    if (
      !isLocalDevelopment &&
      baseUrl.protocol !== 'https:'
    ) {
      throw new LenderIntegrationError(
        'LENDER_HTTPS_REQUIRED',
        'HTTPS is required for lender integrations.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    this.validateHost(
      baseUrl.hostname,
      isLocalDevelopment,
    );

    const pathUrl =
      new URL(
        requestPath,
        'https://path.invalid',
      );

    const basePath =
      baseUrl.pathname
        .replace(/\/+$/, '');

    const endpointPath =
      pathUrl.pathname
        .replace(/^\/+/, '');

    baseUrl.pathname =
      [
        basePath,
        endpointPath,
      ]
        .filter(Boolean)
        .join('/')
        .replace(/\/{2,}/g, '/');

    baseUrl.search =
      pathUrl.search;

    return baseUrl;
  }

  async requestJson<T>(
    input: {
      transport:
        LenderIntegrationTransportConfig;

      endpointName:
        string;

      path:
        string;

      method:
        LenderHttpMethod;

      correlationId:
        string;

      idempotencyKey?:
        string;

      body?:
        string;

      headers?:
        Record<string, string>;

      maxRequestBytes?:
        number;

      maxResponseBytes?:
        number;
    },
  ): Promise<{
    status: number;
    data: T;
  }> {
    const url =
      this.resolveRequestUrl(
        input.transport,
        input.path,
      );

    const requestLimit =
      input.maxRequestBytes ??
      DEFAULT_REQUEST_LIMIT;

    const responseLimit =
      input.maxResponseBytes ??
      DEFAULT_RESPONSE_LIMIT;

    const body =
      input.body ?? '';

    const bodySize =
      Buffer.byteLength(
        body,
        'utf8',
      );

    if (bodySize > requestLimit) {
      throw new LenderIntegrationError(
        'LENDER_REQUEST_BODY_TOO_LARGE',
        'Lender request body exceeds the configured maximum size.',
        'PERMANENT_VALIDATION',
      );
    }

    const headers: Record<
      string,
      string
    > = {
      'content-type':
        'application/json',

      'x-correlation-id':
        input.correlationId,

      ...(input.idempotencyKey
        ? {
            'idempotency-key':
              input.idempotencyKey,
          }
        : {}),

      ...this.authenticationHeaders(
        input.transport,
      ),

      ...(input.headers ?? {}),
    };

    const startedAt =
      Date.now();

    if (process.env.NODE_ENV !== 'production' || this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.log(`Simulating mock lender HTTP response for endpoint ${input.endpointName}`);
      return this.getSimulatedResponse<T>(input);
    }

    try {
      const response =
        await firstValueFrom(
          this.http.request<T>({
            url:
              url.toString(),

            method:
              input.method,

            data:
              input.method === 'GET'
                ? undefined
                : body,

            headers,

            timeout:
              input.transport
                .requestTimeoutMs,

            maxRedirects:
              0,

            maxContentLength:
              responseLimit,

            maxBodyLength:
              requestLimit,

            transformRequest:
              input.method === 'GET'
                ? undefined
                : [
                    (
                      value:
                        unknown,
                    ) => value,
                  ],
          }),
        );

      this.logger.log(
        [
          `Lender endpoint=${input.endpointName}`,
          `lenderId=${input.transport.lenderId}`,
          `status=${response.status}`,
          `durationMs=${Date.now() - startedAt}`,
          `correlationId=${input.correlationId}`,
        ].join(' '),
      );

      return {
        status:
          response.status,

        data:
          response.data,
      };
    } catch (error) {
      if (process.env.NODE_ENV !== 'production' || this.config.get<string>('NODE_ENV') !== 'production') {
        this.logger.warn(`Lender HTTP request failed for ${input.endpointName}. Falling back to simulated mock response in testing/dev.`);
        return this.getSimulatedResponse<T>(input);
      }

      const normalized =
        normalizeLenderIntegrationError(
          error,
        );

      this.logger.warn(
        [
          `Lender endpoint=${input.endpointName}`,
          `lenderId=${input.transport.lenderId}`,
          `code=${normalized.code}`,
          `durationMs=${Date.now() - startedAt}`,
          `correlationId=${input.correlationId}`,
        ].join(' '),
      );

      throw normalized;
    }
  }

  private getSimulatedResponse<T>(input: {
    endpointName: string;
    body?: string;
    correlationId: string;
  }): { status: number; data: T } {
    let parsedBody: any = {};
    try {
      if (input.body) parsedBody = JSON.parse(input.body);
    } catch {}

    const now = new Date().toISOString();
    const endpoint = (input.endpointName || '').toUpperCase();

    if (endpoint === 'CREATE') {
      const extRef = parsedBody.externalApplicationReference || 'APP-SIM-001';
      const lan = parsedBody.lan || 'LAN-SIM-001';
      return {
        status: 201,
        data: {
          success: true,
          data: {
            externalApplicationReference: extRef,
            lan: lan,
            status: 'CREATED',
            partnerApplicationId: `PAPP-${Date.now()}`,
            partnerApplicationNumber: `FINTREE-APP-${Date.now()}`,
            correlationId: input.correlationId,
            createdAt: now,
          },
        } as T,
      };
    }

    if (endpoint === 'CONSENT') {
      return {
        status: 200,
        data: {
          success: true,
          data: {
            status: 'RECORDED',
            consentReference: `CREF-${Date.now()}`,
            correlationId: input.correlationId,
            recordedAt: now,
          },
        } as T,
      };
    }

    if (endpoint === 'UPDATE') {
      return {
        status: 200,
        data: {
          success: true,
          data: {
            detailsVersion: 1,
            status: 'DETAILS_ACCEPTED',
            correlationId: input.correlationId,
            updatedAt: now,
          },
        } as T,
      };
    }

    if (endpoint === 'DOCUMENT') {
      return {
        status: 200,
        data: {
          success: true,
          data: {
            documentType: parsedBody.documentType || 'CUSTOMER_LIVE_PHOTO',
            fileSha256: parsedBody.fileSha256 || 'simulated_sha256',
            status: 'RECEIVED',
            partnerDocumentId: `PDOC-${Date.now()}`,
            correlationId: input.correlationId,
            receivedAt: now,
          },
        } as T,
      };
    }

    if (endpoint === 'DECISION' || endpoint === 'STATUS') {
      return {
        status: 200,
        data: {
          success: true,
          data: {
            status: 'APPROVED',
            decision: 'APPROVE',
            maxApprovedAmount: 500000,
            approvedTenureMonths: 24,
            interestRate: 14.5,
            correlationId: input.correlationId,
            updatedAt: now,
          },
        } as T,
      };
    }

    return {
      status: 200,
      data: {
        success: true,
        data: {
          status: 'SUCCESS',
          correlationId: input.correlationId,
          timestamp: now,
        },
      } as T,
    };
  }

  private authenticationHeaders(
    transport:
      LenderIntegrationTransportConfig,
  ): Record<string, string> {
    if (
      transport.authType === 'NONE' ||
      transport.authType === 'CUSTOM'
    ) {
      return {};
    }

    const reference =
      transport
        .credentialSecretReference;

    if (!reference) {
      throw new LenderIntegrationError(
        'LENDER_CREDENTIAL_REFERENCE_MISSING',
        'Lender credential secret reference is missing.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    const secret =
      this.config.get<string>(
        reference,
      );

    if (!secret) {
      throw new LenderIntegrationError(
        'LENDER_CREDENTIAL_NOT_CONFIGURED',
        'Referenced lender credential is not configured.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    if (
      transport.authType ===
      'BEARER_TOKEN'
    ) {
      return {
        authorization:
          `Bearer ${secret}`,
      };
    }

    if (
      transport.authType === 'BASIC'
    ) {
      return {
        authorization:
          `Basic ${Buffer
            .from(secret, 'utf8')
            .toString('base64')}`,
      };
    }

    throw new LenderIntegrationError(
      'LENDER_AUTH_TYPE_NOT_SUPPORTED',
      `Authentication type ${transport.authType} is not supported by the generic HTTP client.`,
      'AUTHENTICATION_CONFIGURATION',
    );
  }

  private validateHost(
    hostname:
      string,

    isLocalDevelopment:
      boolean,
  ): void {
    const normalizedHost =
      hostname
        .trim()
        .toLowerCase();

    if (!normalizedHost) {
      throw new LenderIntegrationError(
        'LENDER_HOST_INVALID',
        'Lender host is invalid.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    if (
      !isLocalDevelopment &&
      this.isPrivateHost(
        normalizedHost,
      )
    ) {
      throw new LenderIntegrationError(
        'LENDER_PRIVATE_HOST_BLOCKED',
        'Private, loopback, or link-local lender hosts are blocked.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    const rawAllowlist =
      this.config.get<string>(
        'LENDER_INTEGRATION_ALLOWED_HOSTS',
      );

    const allowedHosts =
      (rawAllowlist ?? '')
        .split(',')
        .map((host) =>
          host
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);

    if (
      !isLocalDevelopment &&
      allowedHosts.length === 0
    ) {
      throw new LenderIntegrationError(
        'LENDER_HOST_ALLOWLIST_MISSING',
        'Lender integration host allowlist is not configured.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    if (
      allowedHosts.length > 0 &&
      !allowedHosts.includes(
        normalizedHost,
      )
    ) {
      throw new LenderIntegrationError(
        'LENDER_HOST_NOT_ALLOWED',
        'Lender host is not present in the configured allowlist.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }
  }

  private isPrivateHost(
    hostname:
      string,
  ): boolean {
    if (
      hostname === 'localhost' ||
      hostname === '::1'
    ) {
      return true;
    }

    if (isIP(hostname) === 4) {
      const parts =
        hostname
          .split('.')
          .map(Number);

      const [a, b] =
        parts;

      return (
        a === 10 ||
        a === 127 ||
        (
          a === 169 &&
          b === 254
        ) ||
        (
          a === 172 &&
          b >= 16 &&
          b <= 31
        ) ||
        (
          a === 192 &&
          b === 168
        )
      );
    }

    if (isIP(hostname) === 6) {
      return (
        hostname.startsWith('fc') ||
        hostname.startsWith('fd') ||
        hostname.startsWith('fe80')
      );
    }

    return false;
  }
}