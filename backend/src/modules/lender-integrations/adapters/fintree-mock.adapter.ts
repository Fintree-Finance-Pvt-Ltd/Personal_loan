import { Injectable, Logger } from '@nestjs/common';

import {
  LenderAdapter,
  LenderAdapterCapabilities,
  LenderCreateApplicationContext,
  LenderCreateApplicationResult,
  LenderUpdateApplicationContext,
  LenderUpdateApplicationResult,
} from '../lender-integration.types';

/**
 * Non-HTTP stand-in for lenders under UAT integration that don't have a live endpoint yet.
 * Acknowledges every call locally instead of calling out, so MLM routes can point at these
 * lenders for allocation-funnel testing without a real partner API.
 */
@Injectable()
export class FintreeMockAdapter implements LenderAdapter {
  private readonly logger = new Logger(FintreeMockAdapter.name);

  readonly adapterKey = 'FINTREE_MOCK_ADAPTER';

  readonly adapterVersion = 'v1';

  readonly capabilities: LenderAdapterCapabilities = {
    separateConsentSubmission: false,
    detailsUpdate: true,
    documentUpload: false,
    decisionRequest: false,
    statusPolling: false,
    disbursement: false,
    repaymentNotification: false,
    chargeNotification: false,
    chargeWaiverNotification: false,
  };

  async createApplication(context: LenderCreateApplicationContext): Promise<LenderCreateApplicationResult> {
    this.logger.log(
      `MOCK createApplication applicationReference=${context.application.applicationReference} idempotencyKey=${context.idempotencyKey}`,
    );

    return {
      acknowledged: true,
      providerStatus: 'RECEIVED',
      partnerApplicationId: `MOCK-${context.application.applicationReference}`,
      partnerReference: context.idempotencyKey,
    };
  }

  async updateApplication(context: LenderUpdateApplicationContext): Promise<LenderUpdateApplicationResult> {
    this.logger.log(
      `MOCK updateApplication partnerApplicationId=${context.partnerApplicationId} idempotencyKey=${context.idempotencyKey}`,
    );

    return {
      acknowledged: true,
      providerStatus: 'DETAILS_RECEIVED',
      detailsVersion: context.payloadVersion,
      acknowledgedAt: new Date().toISOString(),
    };
  }
}
