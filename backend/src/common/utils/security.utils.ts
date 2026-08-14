import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

const SENSITIVE_KEYS =
  /password|otp|token|secret|authorization|cookie|api.?key|pan|aadhaar|bank.?account|bureau|kyc|document/i;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function maskEmail(value: string): string {
  const [local = '', domain = ''] = normalizeEmail(value).split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain || 'invalid'}`;
}

export function maskIp(value?: string | null): string | null {
  if (!value) return null;
  if (value.includes(':')) return `${value.split(':').slice(0, 3).join(':')}:…`;
  const parts = value.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : 'masked';
}

export function hmacHex(value: string, key: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function safeHashEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sanitizeObject(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return input;
  if (depth > 4) return '[TRUNCATED]';
  if (Array.isArray(input)) return input.slice(0, 50).map((item) => sanitizeObject(item, depth + 1));
  if (typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, value]) => [key, SENSITIVE_KEYS.test(key) ? '[REDACTED]' : sanitizeObject(value, depth + 1)]),
    );
  }
  if (typeof input === 'string') return input.slice(0, 500);
  return input;
}

export function redactForLog(input: unknown): unknown {
  return sanitizeObject(input);
}

// A cookie-based refresh/logout endpoint relies on SameSite to stop cross-site
// submission, but that's a single setting with no defense-in-depth: if it's ever
// relaxed (an iframe integration, a payment-redirect quirk) the endpoint has zero
// CSRF protection unless something else checks where the request actually came
// from. Call this from any @Public() cookie-authenticated endpoint that mutates
// or reads session state.
export function assertTrustedOrigin(frontendUrl: string, origin?: string, referer?: string): void {
  const trusted = new URL(frontendUrl).origin;
  let candidate: string | undefined;
  try {
    candidate = origin ? new URL(origin).origin : referer ? new URL(referer).origin : undefined;
  } catch {
    candidate = undefined;
  }
  if (candidate !== trusted) {
    throw new UnauthorizedException({
      error: { code: 'UNTRUSTED_ORIGIN', message: 'The request origin is not trusted.' },
    });
  }
}

export function deviceLabel(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Mac OS/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}
