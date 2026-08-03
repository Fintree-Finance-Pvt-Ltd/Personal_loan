// ──────────────────────────────────────────────────────────────────────────
// Partner API – shared constants
// ──────────────────────────────────────────────────────────────────────────

export const PARTNER_API_VERSION = 'v1';
export const PARTNER_API_BASE_PATH = `/api/partner/${PARTNER_API_VERSION}`;

/** Maximum age of the X-Request-Timestamp header in seconds before the request is rejected. */
export const PARTNER_HMAC_TIMESTAMP_TOLERANCE_SECONDS = 300;

/** Maximum number of webhook delivery attempts before moving to DEAD_LETTER. */
export const PARTNER_WEBHOOK_MAX_ATTEMPTS = 8;

/** Retry back-off schedule (seconds) indexed by attempt number (0-based). */
export const PARTNER_WEBHOOK_RETRY_SCHEDULE_SECONDS: number[] = [0, 30, 120, 600, 1800, 3600, 7200, 14400];

/** Name of the standard idempotency key HTTP header. */
export const PARTNER_IDEMPOTENCY_HEADER = 'Idempotency-Key';

/** Allowed state transitions in the partner application state machine. */
export const PARTNER_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['CONSENT_RECORDED'],
  CONSENT_RECORDED: ['PROFILE_COMPLETE'],
  PROFILE_COMPLETE: ['PRE_APPROVAL_PENDING'],
  PRE_APPROVAL_PENDING: ['PRE_APPROVED', 'REJECTED'],
  PRE_APPROVED: ['ONBOARDING_IN_PROGRESS', 'ONBOARDING_COMPLETE'],
  ONBOARDING_IN_PROGRESS: ['ONBOARDING_COMPLETE'],
  ONBOARDING_COMPLETE: ['FINAL_APPROVAL_PENDING'],
  FINAL_APPROVAL_PENDING: ['FINAL_APPROVED', 'REJECTED'],
  FINAL_APPROVED: ['MANDATE_AUTHORIZED'],
  MANDATE_AUTHORIZED: ['DISBURSEMENT_PENDING'],
  DISBURSEMENT_PENDING: ['DISBURSED', 'DISBURSEMENT_FAILED'],
  DISBURSEMENT_FAILED: ['DISBURSEMENT_PENDING'],
  DISBURSED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** Terminal states that can never be overwritten. */
export const PARTNER_TERMINAL_STATES: string[] = ['DISBURSED', 'REJECTED', 'CANCELLED'];
