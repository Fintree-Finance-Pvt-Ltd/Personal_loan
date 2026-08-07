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
  redactLenderIntegrationText,
} from '../lender-integration.errors';

import {
  LenderHttpService,
} from '../lender-http.service';

import {
  FintreeConsentResponseSchema,
  FintreeCreateResponseSchema,
  FintreeDecisionResponseSchema,
  FintreeDetailsResponseSchema,
  FintreeDocumentResponseSchema,
} from './fintree-finance-v1/fintree-finance-v1.schemas';

import {
  mapFintreeConsentPayload,
  mapFintreeCreatePayload,
  mapFintreeDecisionPayload,
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
    decisionRequest: true,
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
        response.data.recordedAt,
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
        response.data.updatedAt,
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
          response.data.receivedAt,
    };
  }

  async requestDecision(
    context:
      LenderDecisionContext,
  ): Promise<LenderDecisionResult> {
    const payload =
      mapFintreeDecisionPayload(
        context,
      );

    const response =
      await this.callFintree({
        context,

        endpointName:
          'DECISION',

        method:
          'POST',

        path:
          this.resolvePartnerPath(
            this.requirePath(
              context.transport
                .decisionPath,
              'decisionPath',
            ),

            context
              .partnerApplicationId,
          ),

        payload,

        schema:
          FintreeDecisionResponseSchema,
      });

    if (!response.success) {
      throw this.partnerError(
        response.error.code,
        response.error.message,
      );
    }

    const status =
      response.data.status
        .trim()
        .toLowerCase();

    if (status === 'rejected') {
      return {
        decision: 'REJECTED',
        providerStatus: response.data.status,
        decisionReference: context.idempotencyKey,
        rejectionReasonCode: 'LENDER_CRITERIA_NOT_MET',
      };
    }

    // The final (post-offer-selection) decision call commonly comes back as a
    // credit-queue/processing state before the async final outcome — recognized
    // generically since Fintree's exact wording for this state isn't yet confirmed.
    if (
      status === 'pending' ||
      status === 'processing' ||
      status === 'under_review' ||
      status === 'in_review' ||
      status === 'queued'
    ) {
      return {
        decision: 'PENDING',
        providerStatus: response.data.status,
        decisionReference: context.idempotencyKey,
      };
    }

    if (status !== 'approved') {
      throw new LenderIntegrationError(
        'FINTREE_DECISION_STATUS_UNRECOGNIZED',
        `Fintree returned an unrecognized decision status: ${response.data.status}`,
        'PERMANENT_VALIDATION',
      );
    }

    const derivedValues =
      response.data.CREDIT_LIMIT_CHECK_RPM
        ?.derived_values;

    const newCustomerLimit =
      derivedValues
        ?.LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM ??
      0;

    const repeatCustomerLimit =
      derivedValues
        ?.LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM ??
      0;

    const approvedAmount =
      newCustomerLimit > 0
        ? newCustomerLimit
        : repeatCustomerLimit;

    if (!(approvedAmount > 0)) {
      throw new LenderIntegrationError(
        'FINTREE_CREDIT_LIMIT_MISSING',
        'Fintree approved the application but did not return a usable credit limit.',
        'PERMANENT_VALIDATION',
      );
    }

    return {
      decision: 'APPROVED',
      providerStatus: response.data.status,
      decisionReference: context.idempotencyKey,
      approvedAmount: String(approvedAmount),
    };
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
      'CUSTOM' || input.context.transport.authType === 'API_KEY'
    ) {
      const secret =
        this.resolveSecret(
          input.context
            .transport
            .credentialSecretReference,
        );

      headers['x-api-key'] = secret;
    }

    headers['X-Correlation-Id'] = input.context.correlationId;
    
    if (input.context.idempotencyKey) {
      headers['Idempotency-Key'] = input.context.idempotencyKey;
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
          `rawResponse=${redactLenderIntegrationText(JSON.stringify(response.data))}`,
          `zodErrors=${redactLenderIntegrationText(JSON.stringify(parsed.error.issues))}`,
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