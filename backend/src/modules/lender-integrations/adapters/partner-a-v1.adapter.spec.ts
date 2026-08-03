import { LenderAdapterRegistry } from '../lender-adapter.registry';
import { PartnerAV1Adapter } from './partner-a-v1.adapter';

describe('PartnerAV1Adapter contract gate', () => {
  const context = {} as any;

  it('resolves only through its exact persisted key and version', () => {
    const adapter = new PartnerAV1Adapter();
    const registry = new LenderAdapterRegistry([adapter]);
    expect(registry.resolve('PARTNER_A_V1', '1')).toBe(adapter);
    expect(() => registry.resolve('PARTNER_A_V1', '2')).toThrow();
  });

  it.each([
    ['CREATE', (adapter: PartnerAV1Adapter) => adapter.createApplication(context)],
    ['UPDATE', (adapter: PartnerAV1Adapter) => adapter.updateApplication(context)],
    ['DECISION', (adapter: PartnerAV1Adapter) => adapter.requestDecision(context)],
    ['STATUS', (adapter: PartnerAV1Adapter) => adapter.getStatus(context)],
  ])('fails closed for %s until the official contract is available', async (_operation, invoke) => {
    await expect(invoke(new PartnerAV1Adapter())).rejects.toMatchObject({
      code: 'PARTNER_CONTRACT_NOT_AVAILABLE',
      classification: 'AUTHENTICATION_CONFIGURATION',
      retryable: false,
    });
  });
});
