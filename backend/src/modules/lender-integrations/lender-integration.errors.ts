import { LenderAdapterErrorClassification } from './lender-integration.types';

const SENSITIVE_PATTERN = /(authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password|pan|aadhaar|account[-_]?number|bank[-_]?account|ifsc|umrn|mobile[-_]?number|email)\s*[']?\s*[:=]\s*[']?[^,;\s}]+[']?/gi;

export class LenderIntegrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly classification: LenderAdapterErrorClassification = 'UNKNOWN',
    public readonly retryable = false,
  ) {
    super(redactLenderIntegrationText(message));
    this.name = 'LenderIntegrationError';
  }
}

export function redactLenderIntegrationText(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value ?? 'Unknown lender integration error');
  return text.replace(SENSITIVE_PATTERN, (_match, key: string) => `${key}=[REDACTED]`).slice(0, 500);
}

export function normalizeLenderIntegrationError(error: unknown): LenderIntegrationError {
  if (error instanceof LenderIntegrationError) return error;
  const status = Number((error as any)?.response?.status ?? (error as any)?.status);
  const code = String((error as any)?.code ?? 'LENDER_INTEGRATION_UNKNOWN');
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(code) || [429, 502, 503, 504].includes(status)) {
    return new LenderIntegrationError(code, redactLenderIntegrationText(error), 'TEMPORARY', true);
  }
  if (status === 401 || status === 403) {
    return new LenderIntegrationError('LENDER_AUTH_CONFIGURATION', 'Lender authentication configuration was rejected.', 'AUTHENTICATION_CONFIGURATION');
  }
  if (status >= 400 && status < 500) {
    return new LenderIntegrationError('LENDER_PERMANENT_VALIDATION', redactLenderIntegrationText(error), 'PERMANENT_VALIDATION');
  }
  return new LenderIntegrationError(code, redactLenderIntegrationText(error));
}
