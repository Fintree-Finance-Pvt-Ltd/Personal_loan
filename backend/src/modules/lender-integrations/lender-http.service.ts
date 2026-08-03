import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { URL } from 'url';
import { LenderIntegrationTransportConfig } from './lender-integration.types';
import { LenderIntegrationError, normalizeLenderIntegrationError } from './lender-integration.errors';

@Injectable()
export class LenderHttpService {
  private readonly logger = new Logger(LenderHttpService.name);

  constructor(private readonly http: HttpService, private readonly config: ConfigService) {}

  async requestJson<T>(input: {
    transport: LenderIntegrationTransportConfig;
    endpointName: string;
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH';
    correlationId: string;
    idempotencyKey?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ status: number; data: T }> {
    if (!input.transport.baseUrl || !input.path) {
      throw new LenderIntegrationError('LENDER_ENDPOINT_NOT_CONFIGURED', `${input.endpointName} endpoint is not configured.`, 'AUTHENTICATION_CONFIGURATION');
    }

    const validatedUrl = this.validateUrlStrict(input.transport.baseUrl, input.path);
    const startedAt = Date.now();
    const headers = {
      'content-type': 'application/json',
      'x-correlation-id': input.correlationId,
      ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}),
      ...this.authenticationHeaders(input.transport),
      ...(input.headers ?? {}),
    };
    try {
      const response = await firstValueFrom(this.http.request<T>({
        url: validatedUrl.toString(),
        method: input.method,
        data: input.body,
        headers,
        timeout: input.transport.requestTimeoutMs,
        maxRedirects: 0,
        maxContentLength: 1_048_576,
        maxBodyLength: 1_048_576,
      }));
      this.logger.log(`Lender endpoint=${input.endpointName} lenderId=${input.transport.lenderId} status=${response.status} durationMs=${Date.now() - startedAt} correlationId=${input.correlationId}`);
      return { status: response.status, data: response.data };
    } catch (error) {
      const normalized = normalizeLenderIntegrationError(error);
      this.logger.warn(`Lender endpoint=${input.endpointName} lenderId=${input.transport.lenderId} code=${normalized.code} durationMs=${Date.now() - startedAt} correlationId=${input.correlationId}`);
      throw normalized;
    }
  }

  private authenticationHeaders(transport: LenderIntegrationTransportConfig): Record<string, string> {
    if (transport.authType === 'NONE') return {};
    if (!transport.credentialSecretReference) {
      throw new LenderIntegrationError('LENDER_CREDENTIAL_REFERENCE_MISSING', 'Lender credential secret reference is missing.', 'AUTHENTICATION_CONFIGURATION');
    }
    const secret = this.config.get<string>(transport.credentialSecretReference);
    if (!secret) {
      throw new LenderIntegrationError('LENDER_CREDENTIAL_NOT_CONFIGURED', 'Referenced lender credential is not configured.', 'AUTHENTICATION_CONFIGURATION');
    }
    if (transport.authType === 'BEARER_TOKEN') return { authorization: `Bearer ${secret}` };
    if (transport.authType === 'BASIC') return { authorization: `Basic ${Buffer.from(secret).toString('base64')}` };
    if (transport.authType === 'CUSTOM') return {};
    throw new LenderIntegrationError('LENDER_AUTH_ADAPTER_REQUIRED', `Authentication type ${transport.authType} requires an official adapter-specific header mapping.`, 'AUTHENTICATION_CONFIGURATION');
  }

  private validateUrlStrict(baseUrl: string, requestPath: string): URL {
    if (!requestPath.startsWith('/')) {
      throw new LenderIntegrationError('SSRF_ATTACK_PREVENTED', 'Path must be relative and start with /');
    }
    if (requestPath.startsWith('//')) {
      throw new LenderIntegrationError('SSRF_ATTACK_PREVENTED', 'Path must not start with //');
    }
    
    // Check for unresolved placeholders
    if (requestPath.includes('{') && requestPath.includes('}')) {
      throw new LenderIntegrationError('SSRF_ATTACK_PREVENTED', 'Unresolved path placeholder detected');
    }

    const url = new URL(requestPath, baseUrl);

    if (this.config.get('NODE_ENV') !== 'development' && url.protocol !== 'https:') {
      throw new LenderIntegrationError('SSRF_ATTACK_PREVENTED', 'Only HTTPS is allowed outside development');
    }

    if (url.username || url.password) {
      throw new LenderIntegrationError('SSRF_ATTACK_PREVENTED', 'Embedded credentials in URL are blocked');
    }

    if (url.hash) {
      throw new LenderIntegrationError('SSRF_ATTACK_PREVENTED', 'URL fragments are not allowed');
    }

    const hostname = url.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      if (this.config.get('NODE_ENV') !== 'development') {
        throw new LenderIntegrationError('SSRF_ATTACK_PREVENTED', 'Private network targets are blocked outside development');
      }
    }

    const allowlistStr = this.config.get<string>('LENDER_HOST_ALLOWLIST');
    if (allowlistStr) {
      const allowedHosts = allowlistStr.split(',').map(h => h.trim());
      if (!allowedHosts.includes(hostname)) {
        throw new LenderIntegrationError('SSRF_ATTACK_PREVENTED', `Host ${hostname} is not in the allowlist`);
      }
    }

    return url;
  }
}
