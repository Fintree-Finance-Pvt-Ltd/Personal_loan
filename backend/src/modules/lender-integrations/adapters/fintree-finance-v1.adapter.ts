import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomUUID,
} from 'crypto';
import { z } from 'zod';

import {
  LenderAdapter,
  LenderConsentContext,
  LenderConsentResult,
  LenderCreateApplicationContext,
  LenderCreateApplicationResult,
  LenderDecisionContext,
  LenderDecisionResult,
  LenderDocumentCandidate,
  LenderDocumentSelection,
  LenderDocumentUploadContext,
  LenderDocumentUploadResult,
  LenderHttpMethod,
  LenderStatusContext,
  LenderStatusResult,
  LenderUpdateApplicationContext,
  LenderUpdateApplicationResult,
} from '../lender-integration.types';

import {
  LenderIntegrationError,
} from '../lender-integration.errors';

import {
  LenderHttpService,
} from '../lender-http.service';

import {
  FintreeConsentResponseSchema,
  FintreeCreateResponseSchema,
  FintreeDetailsResponseSchema,
  FintreeDocumentResponseSchema,
} from './fintree-finance-v1/fintree-finance-v1.schemas';

import {
  mapFintreeConsentPayload,
  mapFintreeCreatePayload,
  mapFintreeDetailsPayload,
  mapFintreeDocumentPayload,
  selectFintreeDocuments,
} from './fintree-finance-v1/fintree-finance-v1.mapper';

const DOCUMENT_REQUEST_LIMIT =
  5_767_168;

@Injectable()
export class FintreeFinanceV1Adapter
  implements LenderAdapter
{
  private readonly logger =
    new Logger(
      FintreeFinanceV1Adapter.name,
    );

  readonly adapterKey =
    'FINTREE_FINANCE_V1';

  readonly adapterVersion =
    '1';

  readonly capabilities = {
    separateConsentSubmission: true,
    detailsUpdate: true,
    documentUpload: true,
    decisionRequest: false,
    statusPolling: false,
  } as const;

  constructor(
    private readonly http:
      LenderHttpService,

    private readonly config:
      ConfigService,
  ) {}

  selectDocuments(
    candidates:
      LenderDocumentCandidate[],
  ): LenderDocumentSelection[] {
    return selectFintreeDocuments(
      candidates,
    );
  }

  async createApplication(
    context:
      LenderCreateApplicationContext,
  ): Promise<
    LenderCreateApplicationResult
  > {
    const payload =
      mapFintreeCreatePayload(
        context,
      );

    const response =
      await this.callFintree({
        context,

        endpointName:
          'CREATE',

        method:
          'POST',

        path:
          this.requirePath(
            context.transport
              .createApplicationPath,
            'createApplicationPath',
          ),

        payload,

        schema:
          FintreeCreateResponseSchema,
      });

    if (!response.success) {
      throw this.partnerError(
        response.error.code,
        response.error.message,
      );
    }

    if (
      response.data
        .externalApplicationReference !==
      payload.externalApplicationReference
    ) {
      throw new LenderIntegrationError(
        'FINTREE_CREATE_REFERENCE_MISMATCH',
        'Fintree returned a different external application reference.',
        'PERMANENT_VALIDATION',
      );
    }

    if (
      response.data.lan !==
      payload.lan
    ) {
      throw new LenderIntegrationError(
        'FINTREE_CREATE_LAN_MISMATCH',
        'Fintree returned a different LAN.',
        'PERMANENT_VALIDATION',
      );
    }

    return {
      acknowledged: true,

      providerStatus:
        response.data.status,

      partnerApplicationId:
        response.data
          .partnerApplicationId,

      partnerReference:
        response.data
          .partnerApplicationNumber,
    };
  }

  async submitConsent(
    context:
      LenderConsentContext,
  ): Promise<LenderConsentResult> {
    const payload =
      mapFintreeConsentPayload(
        context,
      );

    const response =
      await this.callFintree({
        context,

        endpointName:
          'CONSENT',

        method:
          'POST',

        path:
          this.resolvePartnerPath(
            this.requirePath(
              context.transport
                .consentPath,
              'consentPath',
            ),

            context
              .partnerApplicationId,
          ),

        payload,

        schema:
          FintreeConsentResponseSchema,
      });

    if (!response.success) {
      throw this.partnerError(
        response.error.code,
        response.error.message,
      );
    }

    return {
      acknowledged: true,

      providerStatus:
        response.data.status,

      consentReference:
        response.data
          .consentReference,

      acknowledgedAt:
        response.data.recordedAt.toISOString(),
    };
  }

  async updateApplication(
    context:
      LenderUpdateApplicationContext,
  ): Promise<
    LenderUpdateApplicationResult
  > {
    const payload =
      mapFintreeDetailsPayload(
        context,
      );

    const response =
      await this.callFintree({
        context,

        endpointName:
          'DETAILS',

        method:
          'PUT',

        path:
          this.resolvePartnerPath(
            this.requirePath(
              context.transport
                .updateApplicationPath,
              'updateApplicationPath',
            ),

            context
              .partnerApplicationId,
          ),

        payload,

        schema:
          FintreeDetailsResponseSchema,
      });

    if (!response.success) {
      throw this.partnerError(
        response.error.code,
        response.error.message,
      );
    }

    if (
      response.data.detailsVersion !==
      context.payloadVersion
    ) {
      throw new LenderIntegrationError(
        'FINTREE_DETAILS_VERSION_MISMATCH',
        'Fintree returned a different details version.',
        'PERMANENT_VALIDATION',
      );
    }

    return {
      acknowledged: true,

      providerStatus:
        response.data.status,

      detailsVersion:
        response.data
          .detailsVersion,

      acknowledgedAt:
        response.data.updatedAt.toISOString(),
    };
  }

  async uploadDocument(
    context:
      LenderDocumentUploadContext,
  ): Promise<
    LenderDocumentUploadResult
  > {
    const payload =
      mapFintreeDocumentPayload(
        context,
      );

    const response =
      await this.callFintree({
        context,

        endpointName:
          'DOCUMENT',

        method:
          'POST',

        path:
          this.resolvePartnerPath(
            this.requirePath(
              context.transport
                .documentUploadPath,
              'documentUploadPath',
            ),

            context
              .partnerApplicationId,
          ),

        payload,

        schema:
          FintreeDocumentResponseSchema,

        maxRequestBytes:
          DOCUMENT_REQUEST_LIMIT,
      });

    if (!response.success) {
      throw this.partnerError(
        response.error.code,
        response.error.message,
      );
    }

    if (
      response.data.documentType !==
      context.documentType
    ) {
      throw new LenderIntegrationError(
        'FINTREE_DOCUMENT_TYPE_MISMATCH',
        'Fintree returned a different document type.',
        'PERMANENT_VALIDATION',
      );
    }

    if (
      response.data.fileSha256
        .toLowerCase() !==
      context.fileSha256
        .toLowerCase()
    ) {
      throw new LenderIntegrationError(
        'FINTREE_DOCUMENT_HASH_MISMATCH',
        'Fintree returned a different document hash.',
        'PERMANENT_VALIDATION',
      );
    }

    return {
      acknowledged: true,

      providerStatus:
        response.data.status,

      partnerDocumentId:
        response.data
          .partnerDocumentId,

      documentType:
        response.data
          .documentType,

      fileSha256:
        response.data
          .fileSha256,

      acknowledgedAt:
        response.data
          .receivedAt.toISOString(),
    };
  }

  async requestDecision(
    _context:
      LenderDecisionContext,
  ): Promise<LenderDecisionResult> {
    throw new LenderIntegrationError(
      'FINTREE_DECISION_CONTRACT_NOT_ENABLED',
      'Fintree decision contract is not enabled for adapter version 1.',
      'PERMANENT_VALIDATION',
      false,
    );
  }

  async getStatus(
    _context:
      LenderStatusContext,
  ): Promise<LenderStatusResult> {
    throw new LenderIntegrationError(
      'FINTREE_STATUS_CONTRACT_NOT_ENABLED',
      'Fintree status contract is not enabled for adapter version 1.',
      'PERMANENT_VALIDATION',
      false,
    );
  }

  private async callFintree<
    TSchema extends z.ZodTypeAny,
  >(
    input: {
      context: {
        idempotencyKey: string;
        correlationId: string;
        transport:
          LenderCreateApplicationContext['transport'];
      };

      endpointName: string;
      method: LenderHttpMethod;
      path: string;
      payload?: unknown;
      schema: TSchema;
      maxRequestBytes?: number;
    },
  ): Promise<z.output<TSchema>> {
    const serializedBody =
      input.payload === undefined
        ? ''
        : JSON.stringify(
            input.payload,
          );

    const headers:
      Record<string, string> = {};

    if (
      input.context
        .transport.clientId
    ) {
      headers['X-Client-Id'] =
        input.context
          .transport.clientId;
    }

    if (
      input.context
        .transport.authType ===
      'CUSTOM'
    ) {
      const clientId =
        input.context
          .transport.clientId;

      if (!clientId) {
        throw new LenderIntegrationError(
          'FINTREE_CLIENT_ID_MISSING',
          'Fintree client ID is required for HMAC authentication.',
          'AUTHENTICATION_CONFIGURATION',
        );
      }

      const secret =
        this.resolveSecret(
          input.context
            .transport
            .credentialSecretReference,
        );

      const timestamp =
        new Date().toISOString();

      const nonce =
        randomUUID();

      const resolvedUrl =
        this.http.resolveRequestUrl(
          input.context.transport,
          input.path,
        );

      const canonicalPath =
        `${resolvedUrl.pathname}${resolvedUrl.search}`;

      const bodyHash =
        createHash('sha256')
          .update(
            serializedBody,
            'utf8',
          )
          .digest('hex');

      const canonicalInput =
        [
          input.method,
          canonicalPath,
          timestamp,
          nonce,
          input.context
            .idempotencyKey,
          bodyHash,
        ].join('\n');

      const signature =
        createHmac(
          'sha256',
          secret,
        )
          .update(
            canonicalInput,
            'utf8',
          )
          .digest('hex');

      headers[
        'X-Request-Timestamp'
      ] = timestamp;

      headers[
        'X-Nonce'
      ] = nonce;

      headers[
        'X-Signature'
      ] = signature;
    }

    const response =
      await this.http
        .requestJson<unknown>({
          transport:
            input.context
              .transport,

          endpointName:
            input.endpointName,

          path:
            input.path,

          method:
            input.method,

          correlationId:
            input.context
              .correlationId,

          idempotencyKey:
            input.context
              .idempotencyKey,

          headers,

          body:
            serializedBody,

          maxRequestBytes:
            input.maxRequestBytes,
        });

    const parsed =
      input.schema.safeParse(
        response.data,
      );

    if (!parsed.success) {
      this.logger.error(
        [
          'Invalid Fintree response schema',
          `endpoint=${input.endpointName}`,
          `correlationId=${input.context.correlationId}`,
        ].join(' '),
      );

      throw new LenderIntegrationError(
        'FINTREE_RESPONSE_SCHEMA_INVALID',
        'Fintree returned an invalid response structure.',
        'PERMANENT_VALIDATION',
      );
    }

    return parsed.data;
  }

  private requirePath(
    value:
      string | null,

    fieldName:
      string,
  ): string {
    if (!value?.trim()) {
      throw new LenderIntegrationError(
        'FINTREE_ENDPOINT_NOT_CONFIGURED',
        `Fintree endpoint is not configured: ${fieldName}`,
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    return value.trim();
  }

  private resolvePartnerPath(
    pathTemplate:
      string,

    partnerApplicationId:
      string,
  ): string {
    const normalizedId =
      partnerApplicationId
        .trim();

    if (!normalizedId) {
      throw new LenderIntegrationError(
        'FINTREE_PARTNER_APPLICATION_ID_MISSING',
        'Fintree partner application ID is missing.',
        'PERMANENT_VALIDATION',
      );
    }

    const resolved =
      pathTemplate.replace(
        '{partnerApplicationId}',
        encodeURIComponent(
          normalizedId,
        ),
      );

    if (
      resolved.includes('{') ||
      resolved.includes('}')
    ) {
      throw new LenderIntegrationError(
        'FINTREE_ENDPOINT_PLACEHOLDER_INVALID',
        'Fintree endpoint contains an unresolved placeholder.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    return resolved;
  }

  private resolveSecret(
    reference:
      string | null,
  ): string {
    if (!reference) {
      throw new LenderIntegrationError(
        'FINTREE_SECRET_REFERENCE_MISSING',
        'Fintree secret reference is missing.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    const secret =
      this.config.get<string>(
        reference,
      );

    if (!secret) {
      throw new LenderIntegrationError(
        'FINTREE_SECRET_NOT_CONFIGURED',
        'Fintree authentication secret is not configured.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    return secret;
  }

  private partnerError(
    code:
      string,

    message:
      string,
  ): LenderIntegrationError {
    if (
      [
        'UNAUTHORIZED',
        'INVALID_SIGNATURE',
        'CLIENT_DISABLED',
      ].includes(code)
    ) {
      return new LenderIntegrationError(
        code,
        message,
        'AUTHENTICATION_CONFIGURATION',
        false,
      );
    }

    if (
      [
        'RATE_LIMITED',
        'SERVICE_UNAVAILABLE',
        'TEMPORARY_FAILURE',
      ].includes(code)
    ) {
      return new LenderIntegrationError(
        code,
        message,
        'TEMPORARY',
        true,
      );
    }

    return new LenderIntegrationError(
      code,
      message,
      'PERMANENT_VALIDATION',
      false,
    );
  }
}