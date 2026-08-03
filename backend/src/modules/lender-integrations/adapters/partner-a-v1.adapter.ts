import { Injectable } from '@nestjs/common';
import { LenderAdapter, LenderCreateApplicationContext, LenderDecisionContext, LenderStatusContext, LenderUpdateApplicationContext } from '../lender-integration.types';
import { LenderIntegrationError } from '../lender-integration.errors';

@Injectable()
export class PartnerAV1Adapter implements LenderAdapter {
  readonly adapterKey = 'PARTNER_A_V1';
  readonly adapterVersion = '1';

  createApplication(_context: LenderCreateApplicationContext): Promise<never> {
    return Promise.reject(this.notImplemented());
  }

  updateApplication(_context: LenderUpdateApplicationContext): Promise<never> {
    return Promise.reject(this.notImplemented());
  }

  requestDecision(_context: LenderDecisionContext): Promise<never> {
    return Promise.reject(this.notImplemented());
  }

  getStatus(_context: LenderStatusContext): Promise<never> {
    return Promise.reject(this.notImplemented());
  }

  private notImplemented(): LenderIntegrationError {
    return new LenderIntegrationError(
      'PARTNER_CONTRACT_NOT_AVAILABLE',
      'Official partner API contract is required before this adapter can send requests.',
      'AUTHENTICATION_CONFIGURATION',
      false,
    );
  }
}
