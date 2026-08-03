import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
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
        baseURL: input.transport.baseUrl,
        url: input.path,
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
    throw new LenderIntegrationError('LENDER_AUTH_ADAPTER_REQUIRED', `Authentication type ${transport.authType} requires an official adapter-specific header mapping.`, 'AUTHENTICATION_CONFIGURATION');
  }
}
