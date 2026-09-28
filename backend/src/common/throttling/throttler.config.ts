import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { verifiedSessionId } from './session-tracker';

/**
 * The app-wide rate limit: 100 requests per minute, per route.
 *
 * A signed-in user is counted as themselves, not as whoever shares their public IP:
 * mobile carriers put thousands of subscribers behind one NAT address, so per-IP counting
 * would throttle real customers against each other. Only a token whose signature verifies
 * is trusted; everything else (anonymous endpoints such as OTP send and login, forged or
 * expired tokens) is still counted per IP exactly as before.
 */
export function createThrottlerOptions(secrets: string[], limit = 100): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        name: 'default',
        ttl: 60_000,
        limit,
        getTracker: (req) => {
          const sessionId = verifiedSessionId(req.headers?.authorization, secrets);
          return sessionId ? `session:${sessionId}` : String(req.ip);
        },
      },
    ],
  };
}
