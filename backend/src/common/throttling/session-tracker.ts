import { createHmac, timingSafeEqual } from 'crypto';

/**
 * The session id inside a Bearer access token - but ONLY if the token's HS256 signature
 * verifies against one of the given secrets and it has not expired.
 *
 * Used so the rate limiter can count a signed-in user as themselves rather than as whoever
 * shares their public IP address. Indian mobile carriers put thousands of subscribers
 * behind a single NAT address, so counting by IP alone would throttle real customers
 * against each other's traffic.
 *
 * Anything that does not verify (no header, malformed, forged, expired, another algorithm)
 * returns null, and the caller falls back to counting the request by IP exactly as before.
 * That is what keeps anonymous endpoints (OTP send, login) as protected as they were: a
 * client cannot escape the per-IP limit by attaching a made-up token.
 */
export function verifiedSessionId(authorization: unknown, secrets: string[]): string | null {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
  const parts = authorization.slice(7).trim().split('.');
  if (parts.length !== 3) return null;

  let header: { alg?: string };
  let payload: { sid?: unknown; exp?: unknown };
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (header?.alg !== 'HS256') return null;

  const given = Buffer.from(parts[2], 'base64url');
  const signedPart = `${parts[0]}.${parts[1]}`;
  for (const secret of secrets) {
    const expected = createHmac('sha256', secret).update(signedPart).digest();
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) continue;
    if (typeof payload?.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    return typeof payload?.sid === 'string' && payload.sid ? payload.sid : null;
  }
  return null;
}
