import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { LenderAdapter, LenderCreateApplicationContext, LenderDecisionContext, LenderUpdateApplicationContext } from '../lender-integration.types';

@Injectable()
export class MockLenderAAdapter implements LenderAdapter {
  readonly adapterKey = 'MOCK_LENDER_A_V1';
  readonly adapterVersion = '1';

  async createApplication(context: LenderCreateApplicationContext) {
    const mappedRequest = {
      lead_reference: context.application.applicationReference,
      product_code: context.allocation.externalProductCode,
      applicant_mobile: context.customer.mobileNumber,
    };
    const suffix = this.reference(context.idempotencyKey + JSON.stringify(mappedRequest));
    return { acknowledged: true, providerStatus: 'LEAD_CREATED', partnerLeadId: `A-LEAD-${suffix}`, partnerApplicationId: `A-APP-${suffix}`, partnerReference: `A-REF-${suffix}` };
  }

  async updateApplication(context: LenderUpdateApplicationContext) {
    const mappedRequest = { partner_id: context.partnerApplicationId, salaried_profile: context.employment };
    return { acknowledged: true, providerStatus: 'DETAILS_ACCEPTED', partnerReference: `A-UPD-${this.reference(JSON.stringify(mappedRequest))}` };
  }

  async requestDecision(context: LenderDecisionContext) {
    return { decision: 'APPROVED' as const, providerStatus: 'ELIGIBLE', decisionReference: `A-DEC-${this.reference(context.idempotencyKey)}`, approvedAmount: '100000.00', approvedTenure: 12, approvedRoi: '18.0000' };
  }

  private reference(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 12).toUpperCase();
  }
}
