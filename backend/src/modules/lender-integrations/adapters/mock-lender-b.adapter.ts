import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { LenderAdapter, LenderCreateApplicationContext, LenderDecisionContext, LenderUpdateApplicationContext } from '../lender-integration.types';

@Injectable()
export class MockLenderBAdapter implements LenderAdapter {
  readonly adapterKey = 'MOCK_LENDER_B_V1';
  readonly adapterVersion = '1';

  async createApplication(context: LenderCreateApplicationContext) {
    const mappedRequest = {
      application: { reference: context.application.applicationReference },
      offering: { code: context.allocation.externalProductCode },
      contact: { phone: context.customer.mobileNumber, email: context.customer.email },
    };
    const suffix = this.reference(context.idempotencyKey + JSON.stringify(mappedRequest));
    return { acknowledged: true, providerStatus: 'APPLICATION_REGISTERED', partnerApplicationId: `B-${suffix}`, partnerReference: `B-REG-${suffix}` };
  }

  async updateApplication(context: LenderUpdateApplicationContext) {
    const mappedRequest = { application_reference: context.partnerApplicationId, profile: { employment: context.employment, verification: context.verification } };
    return { acknowledged: true, providerStatus: 'PROFILE_UPDATED', partnerReference: `B-UPD-${this.reference(JSON.stringify(mappedRequest))}` };
  }

  async requestDecision(context: LenderDecisionContext) {
    return { decision: 'APPROVED' as const, providerStatus: 'ACCEPTED', decisionReference: `B-DEC-${this.reference(context.idempotencyKey)}`, approvedAmount: '125000.00', approvedTenure: 18, approvedRoi: '17.5000' };
  }

  private reference(value: string): string {
    return createHash('sha256').update(value).digest('base64url').slice(0, 12).toUpperCase();
  }
}
