import type { ConfigService } from '@nestjs/config';

/**
 * Which kind of process this is.
 *
 * Defaults to 'all' — a single process doing everything, exactly how the app has always
 * run — so leaving APP_ROLE unset changes nothing.
 *
 *   'api'    serves HTTP only. Safe to run as many copies as needed (PM2 cluster mode).
 *   'worker' also runs the background work: the lender outbox worker, the partner-webhook
 *            worker and every scheduled (@Cron) job. Run exactly ONE of these — the
 *            scheduled jobs (SMS/IVR/WhatsApp reminders, debit presentment) have no
 *            distributed lock, so a second copy would fire each of them twice.
 */
export type AppRole = 'all' | 'api' | 'worker';

export function getAppRole(config: Pick<ConfigService, 'get'>): AppRole {
  const role = config.get<string>('APP_ROLE');
  return role === 'api' || role === 'worker' ? role : 'all';
}

/** False only for a pure API process — every other role runs the background work. */
export function runsBackgroundWork(config: Pick<ConfigService, 'get'>): boolean {
  return getAppRole(config) !== 'api';
}
