import { ApplicationConsentType } from '@prisma/client';
import { createHash } from 'crypto';

/**
 * The single source of truth for every consent taken in the customer journey.
 *
 * Before this existed the copy lived in three places — the React screen that showed it,
 * the service that hashed it, and the mapper that sent it — and they drifted: the
 * assessment-fee consent was the only one ever transmitted, and LENDER_CREDIT_ASSESSMENT
 * was validated but silently never sent. Everything now derives from this table, so the
 * text a customer agreed to, the hash stored as evidence, and the payload the lender
 * receives are the same string by construction.
 *
 * `text` may be a function when the copy names the allocated lender.
 *
 * IMPORTANT: changing the wording of an existing consent means bumping its `version`, not
 * editing in place. Stored evidence is validated by re-hashing `text`, so altering a
 * version's wording would invalidate every consent already captured under it.
 */
export interface ConsentDefinition {
  type: ApplicationConsentType;
  templateId: string;
  version: string;
  text: (context: { lenderDisplayName: string }) => string;
  /** Where in the journey this is taken — used for operator-facing copy only. */
  stage: string;
  /** Whether a lender submission is expected for this consent. */
  submitToLender: boolean;
}

const define = (definition: ConsentDefinition) => definition;

export const CONSENT_CATALOGUE: Record<ApplicationConsentType, ConsentDefinition> = {
  LIVE_PHOTO_CAPTURE: define({
    type: 'LIVE_PHOTO_CAPTURE',
    templateId: 'LIVE_PHOTO_CAPTURE_V1',
    version: '1.0',
    stage: 'PROFILE_DETAILS',
    submitToLender: true,
    text: () =>
      'I consent to the capture and processing of my live photograph and current location for identity verification, fraud prevention and loan application processing.',
  }),

  AADHAAR_KYC: define({
    type: 'AADHAAR_KYC',
    templateId: 'AADHAAR_KYC_V1',
    version: '1.0',
    stage: 'AADHAAR_KYC',
    submitToLender: true,
    text: ({ lenderDisplayName }) =>
      `I consent to ${lenderDisplayName} securely initiating DigiLocker-based Aadhaar KYC using my verified account information. I authorize the retrieval and processing of permitted identity information for loan onboarding, verification and lender submission.`,
  }),

  DATA_SHARING: define({
    type: 'DATA_SHARING',
    templateId: 'LENDER_DATA_SHARING_V1',
    version: '1.0',
    stage: 'ASSESSMENT_FEE',
    submitToLender: true,
    text: ({ lenderDisplayName }) =>
      `I consent to share my application data with ${lenderDisplayName} for eligibility assessment and final decision.`,
  }),

  ACCOUNT_AGGREGATOR: define({
    type: 'ACCOUNT_AGGREGATOR',
    templateId: 'ACCOUNT_AGGREGATOR_V1',
    version: '1.0',
    stage: 'ACCOUNT_AGGREGATOR',
    submitToLender: true,
    text: ({ lenderDisplayName }) =>
      `I consent to share my bank account statement information through the RBI-regulated Account Aggregator network with ${lenderDisplayName} for income assessment and loan underwriting.`,
  }),

  BUREAU_ENQUIRY: define({
    type: 'BUREAU_ENQUIRY',
    templateId: 'BUREAU_ENQUIRY_V1',
    version: '1.0',
    stage: 'SUBMIT_APPLICATION',
    submitToLender: true,
    text: () => 'I authorize a bureau enquiry for this loan application.',
  }),

  LENDER_CREDIT_ASSESSMENT: define({
    type: 'LENDER_CREDIT_ASSESSMENT',
    templateId: 'LENDER_CREDIT_ASSESSMENT_V1',
    version: '1.0',
    stage: 'SUBMIT_APPLICATION',
    submitToLender: true,
    text: () => 'I authorize the allocated lender to assess my eligibility and credit profile.',
  }),

  LENDER_DECISION_REQUEST: define({
    type: 'LENDER_DECISION_REQUEST',
    templateId: 'LENDER_DECISION_REQUEST_V1',
    version: '1.0',
    stage: 'SUBMIT_APPLICATION',
    submitToLender: true,
    text: () =>
      'I authorize submission of my completed application to the allocated lender for a lending decision.',
  }),
};

export const ALL_CONSENT_TYPES = Object.keys(CONSENT_CATALOGUE) as ApplicationConsentType[];

export const LENDER_SUBMITTED_CONSENT_TYPES = ALL_CONSENT_TYPES.filter(
  (type) => CONSENT_CATALOGUE[type].submitToLender,
);

/**
 * Whether the lender is ready to receive one submission per consent type.
 *
 * This gates the entire per-type fan-out, not just the newer consent types, because the
 * lender validates the Idempotency-Key as well as the consentType. Their validator
 * reconstructs `{applicationReference}:LENDER_SUBMIT_CONSENT:V{n}` and compares, so a
 * per-type key such as `...:LENDER_SUBMIT_CONSENT:BUREAU_ENQUIRY:V1` is rejected outright
 * with INVALID_IDEMPOTENCY_KEY — including for the three consent types they already accept.
 *
 * Off (the default) reproduces the previous behaviour byte for byte: one data-sharing
 * submission under the original key. Consents are recorded as evidence either way, so
 * nothing is lost by waiting — held-back consents are queued on the next submission pass
 * once the lender confirms support and this is switched on.
 */
export function isPerTypeConsentSubmissionEnabled(): boolean {
  return String(process.env.LENDER_SUBMIT_EXTENDED_CONSENTS ?? '').toLowerCase() === 'true';
}

/** Whether this consent may be forwarded to the lender right now. */
export function canSubmitConsentToLender(type: ApplicationConsentType): boolean {
  if (!CONSENT_CATALOGUE[type]?.submitToLender) return false;
  if (!isPerTypeConsentSubmissionEnabled()) return type === 'DATA_SHARING';
  return true;
}

/**
 * The Idempotency-Key for a consent submission.
 *
 * Data sharing keeps the original three-segment key permanently — it is the shape the
 * lender has always accepted, and reusing it means events queued before the fan-out shipped
 * still resolve to the same outbox row rather than being re-sent under a new key.
 */
export function consentIdempotencyKey(
  applicationReference: string,
  type: ApplicationConsentType,
): string {
  return type === 'DATA_SHARING'
    ? `${applicationReference}:LENDER_SUBMIT_CONSENT:V1`
    : `${applicationReference}:LENDER_SUBMIT_CONSENT:${type}:V1`;
}

export function consentTextFor(
  type: ApplicationConsentType,
  lenderDisplayName: string,
): string {
  return CONSENT_CATALOGUE[type].text({ lenderDisplayName });
}

export function hashConsentText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * True when a stored consent's text still hashes to the hash recorded alongside it — the
 * check that makes the row usable as evidence rather than just a flag in a database.
 */
export function isConsentEvidenceIntact(consent: {
  consentText: string;
  consentTextHash: string;
}): boolean {
  return hashConsentText(consent.consentText) === consent.consentTextHash;
}
