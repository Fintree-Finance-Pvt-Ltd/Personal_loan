import {
  ALL_CONSENT_TYPES,
  CONSENT_CATALOGUE,
  LENDER_SUBMITTED_CONSENT_TYPES,
  canSubmitConsentToLender,
  consentTextFor,
  hashConsentText,
  isConsentEvidenceIntact,
} from './consent-catalogue';

describe('consent catalogue', () => {
  it('covers every consent point taken in the customer journey', () => {
    expect(ALL_CONSENT_TYPES.sort()).toEqual(
      [
        'ACCOUNT_AGGREGATOR',
        'AADHAAR_KYC',
        'BUREAU_ENQUIRY',
        'DATA_SHARING',
        'LENDER_CREDIT_ASSESSMENT',
        'LENDER_DECISION_REQUEST',
        'LIVE_PHOTO_CAPTURE',
      ].sort(),
    );
  });

  // The whole point of the catalogue: previously the assessment-fee consent was the only
  // one ever transmitted, and LENDER_CREDIT_ASSESSMENT was validated then silently dropped.
  it('marks every consent for submission to the lender', () => {
    expect(LENDER_SUBMITTED_CONSENT_TYPES.sort()).toEqual(ALL_CONSENT_TYPES.sort());
  });

  it('keys each definition by its own type so lookups cannot cross-wire', () => {
    for (const type of ALL_CONSENT_TYPES) {
      expect(CONSENT_CATALOGUE[type].type).toBe(type);
    }
  });

  it('gives every consent a non-empty, distinct wording', () => {
    const texts = ALL_CONSENT_TYPES.map((type) => consentTextFor(type, 'Test Lender'));
    for (const text of texts) expect(text.length).toBeGreaterThan(20);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('names the allocated lender in the consents that reference one', () => {
    expect(consentTextFor('DATA_SHARING', 'Acme Credit')).toContain('Acme Credit');
    expect(consentTextFor('AADHAAR_KYC', 'Acme Credit')).toContain('Acme Credit');
    expect(consentTextFor('ACCOUNT_AGGREGATOR', 'Acme Credit')).toContain('Acme Credit');
  });

  // The stored hash is what makes a consent row evidence rather than a boolean. A row whose
  // text has been edited after the fact must fail this, and is refused for submission.
  it('detects consent text that no longer matches its stored hash', () => {
    const text = consentTextFor('BUREAU_ENQUIRY', 'Acme Credit');
    expect(isConsentEvidenceIntact({ consentText: text, consentTextHash: hashConsentText(text) })).toBe(true);
    expect(isConsentEvidenceIntact({ consentText: 'tampered', consentTextHash: hashConsentText(text) })).toBe(false);
  });

  // Recording a consent and forwarding it are separate concerns. The lender validates
  // consentType against a fixed list, so a type they have not deployed support for yet must
  // stay stored-but-unsent rather than failing repeatedly against their API.
  describe('canSubmitConsentToLender', () => {
    const original = process.env.LENDER_SUBMIT_EXTENDED_CONSENTS;
    afterEach(() => {
      if (original === undefined) delete process.env.LENDER_SUBMIT_EXTENDED_CONSENTS;
      else process.env.LENDER_SUBMIT_EXTENDED_CONSENTS = original;
    });

    it('always forwards the four types the lender already accepts', () => {
      delete process.env.LENDER_SUBMIT_EXTENDED_CONSENTS;
      for (const type of ['DATA_SHARING', 'BUREAU_ENQUIRY', 'LENDER_CREDIT_ASSESSMENT', 'LENDER_DECISION_REQUEST'] as const) {
        expect(canSubmitConsentToLender(type)).toBe(true);
      }
    });

    it('holds back the newer types until the lender is ready', () => {
      delete process.env.LENDER_SUBMIT_EXTENDED_CONSENTS;
      for (const type of ['LIVE_PHOTO_CAPTURE', 'AADHAAR_KYC', 'ACCOUNT_AGGREGATOR'] as const) {
        expect(canSubmitConsentToLender(type)).toBe(false);
      }
    });

    it('releases the newer types once the flag is set', () => {
      process.env.LENDER_SUBMIT_EXTENDED_CONSENTS = 'true';
      for (const type of ['LIVE_PHOTO_CAPTURE', 'AADHAAR_KYC', 'ACCOUNT_AGGREGATOR'] as const) {
        expect(canSubmitConsentToLender(type)).toBe(true);
      }
    });
  });

  // These exact strings are what customers agreed to and what is hashed into stored
  // evidence. Changing one means bumping the version, not editing in place — re-hashing
  // would invalidate every consent already captured under the old wording.
  it('pins the wording of each consent against accidental edits', () => {
    expect(consentTextFor('LIVE_PHOTO_CAPTURE', 'Acme Credit')).toBe(
      'I consent to the capture and processing of my live photograph and current location for identity verification, fraud prevention and loan application processing.',
    );
    expect(consentTextFor('DATA_SHARING', 'Acme Credit')).toBe(
      'I consent to share my application data with Acme Credit for eligibility assessment and final decision.',
    );
    expect(consentTextFor('BUREAU_ENQUIRY', 'Acme Credit')).toBe(
      'I authorize a bureau enquiry for this loan application.',
    );
  });
});
