import { createHash } from 'crypto';
import { mapFintreeConsentPayload } from './fintree-finance-v1.mapper';
import { LenderConsentContext } from '../../lender-integration.types';

describe('mapFintreeConsentPayload', () => {
  const consentText = 'I authorize a bureau enquiry for this loan application.';

  const context = (overrides: Partial<LenderConsentContext> = {}): LenderConsentContext =>
    ({
      idempotencyKey: 'APP-001:LENDER_SUBMIT_CONSENT:BUREAU_ENQUIRY:V1',
      correlationId: 'corr-1',
      payloadVersion: 1,
      transport: {} as any,
      partnerApplicationId: 'P-1',
      applicationReference: 'APP-001',
      platformLan: 'FTPL00000001',
      consentId: 'CONSENT-1',
      consentType: 'BUREAU_ENQUIRY',
      consentTemplateId: 'BUREAU_ENQUIRY_V1',
      consentVersion: '1.0',
      consentTextHash: createHash('sha256').update(consentText, 'utf8').digest('hex'),
      consentReference: 'BUREAU_ENQUIRY',
      acceptedAt: '2026-09-03T00:00:00.000Z',
      ipAddress: '127.0.0.1',
      userAgentHash: null,
      ...overrides,
    }) as LenderConsentContext;

  // consentType was hardcoded to LENDER_DATA_SHARING, which was only correct while that was
  // the sole consent ever transmitted. All seven would otherwise arrive indistinguishable.
  it('sends each consent under its own type', () => {
    expect(mapFintreeConsentPayload(context()).consentType).toBe('BUREAU_ENQUIRY');
    expect(
      mapFintreeConsentPayload(context({ consentType: 'ACCOUNT_AGGREGATOR' })).consentType,
    ).toBe('ACCOUNT_AGGREGATOR');
    expect(
      mapFintreeConsentPayload(context({ consentType: 'LENDER_DATA_SHARING' })).consentType,
    ).toBe('LENDER_DATA_SHARING');
  });

  it('identifies the wording by template and version', () => {
    const payload = mapFintreeConsentPayload(context());

    expect(payload.consentTemplateId).toBe('BUREAU_ENQUIRY_V1');
    expect(payload.consentVersion).toBe('1.0');
    expect(payload.consentTextHash).toBe(
      createHash('sha256').update(consentText, 'utf8').digest('hex'),
    );
  });

  // The consent wording is deliberately NOT transmitted — the lender receives the hash plus
  // the template id/version that identify which text it covers. Adding the plain text here
  // would be a partner-contract change, not a local one.
  it('does not transmit the consent wording itself', () => {
    expect(mapFintreeConsentPayload(context())).not.toHaveProperty('consentText');
  });

  it('refuses to build a payload with no consent type', () => {
    expect(() => mapFintreeConsentPayload(context({ consentType: '' }))).toThrow(/consentType/);
  });
});
