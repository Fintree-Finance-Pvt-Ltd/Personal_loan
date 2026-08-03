import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { z } from 'zod';
import { 
  LenderAdapter, 
  LenderCreateApplicationContext, 
  LenderUpdateApplicationContext, 
  LenderDecisionContext, 
  LenderStatusContext, 
  LenderCreateApplicationResult,
  LenderUpdateApplicationResult,
  LenderDecisionResult,
  LenderStatusResult,
  LenderConsentContext,
  LenderConsentResult
} from '../lender-integration.types';
import { LenderHttpService } from '../lender-http.service';
import { LenderIntegrationError } from '../lender-integration.errors';
import {
  FintreeCreateResponseSchema,
  FintreeConsentResponseSchema,
  FintreeProfileResponseSchema,
  FintreePreApprovalResponseSchema,
  FintreeStatusResponseSchema
} from './fintree-finance-v1/fintree-finance-v1.schemas';
import {
  mapFintreeCreatePayload,
  mapFintreeConsentPayload,
  mapFintreeProfilePayload,
  mapFintreePreApprovalPayload
} from './fintree-finance-v1/fintree-finance-v1.mapper';

@Injectable()
export class FintreeFinanceV1Adapter implements LenderAdapter {
  private readonly logger = new Logger(FintreeFinanceV1Adapter.name);
  readonly adapterKey = 'FINTREE_FINANCE_V1';
  readonly adapterVersion = '1';

  constructor(
    private readonly http: LenderHttpService,
    private readonly config: ConfigService
  ) {}

  private getSecret(context: any): string {
    const secretRef = context.transport.credentialSecretReference;
    if (!secretRef) {
      throw new LenderIntegrationError('AUTHENTICATION_CONFIGURATION', 'Missing Fintree credentialSecretReference');
    }
    const secret = this.config.get<string>(secretRef);
    if (!secret) {
      throw new LenderIntegrationError('AUTHENTICATION_CONFIGURATION', `Secret not found in environment for ${secretRef}`);
    }
    return secret;
  }

  private async makeAuthenticatedRequest<T>(context: any, schema: z.ZodType<T>, endpointName: string, pathTemplate: string, payload?: any): Promise<T> {
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const idempotencyKey = context.idempotencyKey;
    const clientId = context.transport.clientId;
    const authType = context.transport.authType;

    if (!clientId) {
      throw new LenderIntegrationError('AUTHENTICATION_CONFIGURATION', 'Missing Fintree clientId');
    }

    const path = pathTemplate.replace('{partnerApplicationId}', context.partnerApplicationId || '');
    const bodyString = payload ? JSON.stringify(payload) : '';
    
    const headers: Record<string, string> = {
      'X-Client-Id': clientId,
    };

    if (authType === 'CUSTOM') {
      const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');
      const canonicalString = [
        'POST',
        path,
        timestamp,
        nonce,
        idempotencyKey,
        bodyHash
      ].join('\n');

      const secret = this.getSecret(context);
      const signature = crypto.createHmac('sha256', secret).update(canonicalString).digest('hex');
      
      headers['X-Request-Timestamp'] = timestamp;
      headers['X-Nonce'] = nonce;
      headers['X-Signature'] = signature;
    }

    const response = await this.http.requestJson<unknown>({
      transport: context.transport,
      endpointName,
      path,
      method: 'POST',
      correlationId: context.correlationId,
      idempotencyKey,
      headers,
      body: bodyString,
    });

    const validation = schema.safeParse(response.data);
    if (!validation.success) {
      this.logger.error(`Invalid Fintree response for ${endpointName}: ${validation.error.message}`, validation.error.stack);
      throw new LenderIntegrationError('LENDER_VALIDATION_ERROR', `Invalid response schema from Fintree ${endpointName}`);
    }

    return validation.data;
  }

  async createApplication(context: LenderCreateApplicationContext): Promise<LenderCreateApplicationResult> {
    const payload = mapFintreeCreatePayload(context);
    const path = context.transport.createApplicationPath || '/api/partner/v1/applications';
    const data = await this.makeAuthenticatedRequest(context, FintreeCreateResponseSchema, 'CREATE', path, payload);

    if (data.status === 'REJECTED') {
      return {
        acknowledged: false,
        providerStatus: data.status,
        partnerReference: data.error
      };
    }

    if (!data.partnerApplicationId) {
      throw new LenderIntegrationError('LENDER_PROTOCOL_ERROR', 'Fintree returned ACKNOWLEDGED but missing partnerApplicationId');
    }

    return {
      acknowledged: true,
      providerStatus: data.status,
      partnerApplicationId: data.partnerApplicationId,
      partnerReference: data.partnerReference
    };
  }

  async submitConsent(context: LenderConsentContext): Promise<LenderConsentResult> {
    const payload = mapFintreeConsentPayload(context);
    const path = context.transport.consentPath || '/api/partner/v1/applications/{partnerApplicationId}/consent';
    const data = await this.makeAuthenticatedRequest(context, FintreeConsentResponseSchema, 'CONSENT', path, payload);

    return {
      acknowledged: data.status === 'ACKNOWLEDGED',
      providerStatus: data.status,
      consentReference: data.consentReference
    };
  }

  async updateApplication(context: LenderUpdateApplicationContext): Promise<LenderUpdateApplicationResult> {
    const payload = mapFintreeProfilePayload(context);
    const path = context.transport.updateApplicationPath || '/api/partner/v1/applications/{partnerApplicationId}/profile';
    const data = await this.makeAuthenticatedRequest(context, FintreeProfileResponseSchema, 'UPDATE', path, payload);

    return {
      acknowledged: data.status === 'ACKNOWLEDGED',
      providerStatus: data.status
    };
  }

  async requestDecision(context: LenderDecisionContext): Promise<LenderDecisionResult> {
    const payload = mapFintreePreApprovalPayload(context);
    const path = context.transport.decisionPath || '/api/partner/v1/applications/{partnerApplicationId}/pre-approval';
    const data = await this.makeAuthenticatedRequest(context, FintreePreApprovalResponseSchema, 'DECISION', path, payload);

    return this.mapDecisionResponse(data);
  }

  async getStatus(context: LenderStatusContext): Promise<LenderStatusResult> {
    const path = context.transport.statusPath || '/api/partner/v1/applications/{partnerApplicationId}/status';
    const data = await this.makeAuthenticatedRequest(context, FintreeStatusResponseSchema, 'STATUS', path, {});

    return this.mapDecisionResponse(data);
  }

  private mapDecisionResponse(data: z.infer<typeof FintreePreApprovalResponseSchema | typeof FintreeStatusResponseSchema>): LenderDecisionResult {
    let normalizedDecision: 'APPROVED' | 'REJECTED' | 'PENDING';
    
    if (data.status === 'APPROVED') normalizedDecision = 'APPROVED';
    else if (data.status === 'REJECTED') normalizedDecision = 'REJECTED';
    else normalizedDecision = 'PENDING';

    return {
      decision: normalizedDecision,
      providerStatus: data.status,
      decisionReference: data.decisionReference || '',
      approvedAmount: data.approvedAmount ? String(data.approvedAmount) : null,
      approvedTenure: data.approvedTenure || null,
      approvedRoi: data.approvedRoi ? String(data.approvedRoi) : null,
      rejectionReasonCode: data.rejectionReason || data.error || null
    };
  }
}

