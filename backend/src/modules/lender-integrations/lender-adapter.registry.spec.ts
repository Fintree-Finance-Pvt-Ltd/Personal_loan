import { LenderAdapterRegistry } from './lender-adapter.registry';
import { LenderIntegrationError } from './lender-integration.errors';
import { LenderAdapter } from './lender-integration.types';

const adapter = (adapterKey: string, adapterVersion = '1'): LenderAdapter => ({
  adapterKey,
  adapterVersion,
  createApplication: jest.fn(),
  updateApplication: jest.fn(),
  requestDecision: jest.fn(),
  capabilities: { separateConsentSubmission: false, detailsUpdate: false, documentUpload: false, decisionRequest: false, statusPolling: false, disbursement: false },
});

describe('LenderAdapterRegistry', () => {
  it('resolves only the exact adapter key and version', () => {
    const selected = adapter('MOCK_LENDER_A_V1');
    const registry = new LenderAdapterRegistry([selected]);
    expect(registry.resolve('MOCK_LENDER_A_V1', '1')).toBe(selected);
  });

  it('rejects duplicate key/version registration', () => {
    const registry = new LenderAdapterRegistry([adapter('MOCK_LENDER_A_V1')]);
    expect(() => registry.register(adapter('MOCK_LENDER_A_V1'))).toThrow(LenderIntegrationError);
  });

  it('does not fall back when an adapter is unknown', () => {
    const registry = new LenderAdapterRegistry([adapter('MOCK_LENDER_A_V1')]);
    expect(() => registry.resolve('UNKNOWN', '1')).toThrow(expect.objectContaining({ code: 'LENDER_ADAPTER_NOT_CONFIGURED' }));
  });
});
