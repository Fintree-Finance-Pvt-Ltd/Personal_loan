import { MockLenderAAdapter } from './mock-lender-a.adapter';
import { MockLenderBAdapter } from './mock-lender-b.adapter';
import { LenderAdapterRegistry } from '../lender-adapter.registry';

const context: any = {
  idempotencyKey: 'APP-1:LENDER_CREATE_APPLICATION:V1',
  correlationId: 'CORR-1',
  payloadVersion: 1,
  transport: { lenderId: 'L1' },
  application: { applicationReference: 'APP-1' },
  allocation: { externalProductCode: 'PL-EXT' },
  customer: { mobileNumber: '9999999999', email: 'customer@example.test' },
};

describe('mock selected-lender adapters', () => {
  it('dispatches A only to Mock A and preserves idempotent partner reference', async () => {
    const mockA = new MockLenderAAdapter();
    const mockB = new MockLenderBAdapter();
    const spyB = jest.spyOn(mockB, 'createApplication');
    const selected = new LenderAdapterRegistry([mockA, mockB]).resolve('MOCK_LENDER_A_V1', '1');
    const first = await selected.createApplication(context);
    const retry = await selected.createApplication(context);
    expect(first.partnerApplicationId).toBe(retry.partnerApplicationId);
    expect(first.providerStatus).toBe('LEAD_CREATED');
    expect(spyB).not.toHaveBeenCalled();
  });

  it('dispatches B only to Mock B with its different response style', async () => {
    const mockA = new MockLenderAAdapter();
    const mockB = new MockLenderBAdapter();
    const spyA = jest.spyOn(mockA, 'createApplication');
    const selected = new LenderAdapterRegistry([mockA, mockB]).resolve('MOCK_LENDER_B_V1', '1');
    const result = await selected.createApplication(context);
    expect(result.providerStatus).toBe('APPLICATION_REGISTERED');
    expect(result.partnerApplicationId).toMatch(/^B-/);
    expect(spyA).not.toHaveBeenCalled();
  });
});
