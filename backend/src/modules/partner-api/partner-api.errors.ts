// ──────────────────────────────────────────────────────────────────────────
// Partner API – custom error class
// ──────────────────────────────────────────────────────────────────────────

export type PartnerApiErrorCode =
  | 'PARTNER_AUTH_MISSING_HEADER'
  | 'PARTNER_AUTH_CLIENT_NOT_FOUND'
  | 'PARTNER_AUTH_CLIENT_INACTIVE'
  | 'PARTNER_AUTH_IP_NOT_ALLOWED'
  | 'PARTNER_AUTH_TIMESTAMP_EXPIRED'
  | 'PARTNER_AUTH_NONCE_REPLAYED'
  | 'PARTNER_AUTH_SIGNATURE_INVALID'
  | 'PARTNER_IDEMPOTENCY_KEY_MISSING'
  | 'PARTNER_IDEMPOTENCY_CONFLICT'
  | 'PARTNER_APPLICATION_NOT_FOUND'
  | 'PARTNER_STATE_INVALID_TRANSITION'
  | 'PARTNER_STATE_TERMINAL'
  | 'PARTNER_CONSENT_ALREADY_RECORDED'
  | 'PARTNER_PROFILE_VALIDATION_FAILED'
  | 'PARTNER_DECISION_PRE_APPROVAL_REQUIRED'
  | 'PARTNER_ONBOARDING_REQUIRED'
  | 'PARTNER_MANDATE_REQUIRED'
  | 'PARTNER_MANDATE_ALREADY_AUTHORIZED'
  | 'PARTNER_DISBURSEMENT_DUPLICATE'
  | 'PARTNER_INTERNAL_ERROR';

export class PartnerApiError extends Error {
  constructor(
    public readonly code: PartnerApiErrorCode,
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = 'PartnerApiError';
  }
}

export function normalizePartnerApiError(err: unknown): PartnerApiError {
  if (err instanceof PartnerApiError) return err;
  if (err instanceof Error) return new PartnerApiError('PARTNER_INTERNAL_ERROR', err.message, 500);
  return new PartnerApiError('PARTNER_INTERNAL_ERROR', 'An unknown internal error occurred.', 500);
}
