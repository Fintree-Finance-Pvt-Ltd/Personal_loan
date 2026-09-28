export const REJECTED_APPLICATION_STATUSES = ['PLATFORM_REJECTED', 'LENDER_REJECTED'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default wait after a rejection. Override with REAPPLY_COOLING_OFF_DAYS (0 disables it). */
export const DEFAULT_REAPPLY_COOLING_OFF_DAYS = 30;

/** Reads REAPPLY_COOLING_OFF_DAYS; anything missing, negative or not a whole number falls back to the default. */
export function getReapplyCoolingOffDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.REAPPLY_COOLING_OFF_DAYS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_REAPPLY_COOLING_OFF_DAYS;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_REAPPLY_COOLING_OFF_DAYS;
}

export interface ReapplyCooldown {
  active: boolean;
  eligibleAt: Date | null;
  daysRemaining: number;
}

/**
 * When may a customer whose latest application was rejected apply again?
 *
 * The later of (rejection + configured days) and any wait the lender itself asked for wins,
 * so a lender-imposed longer cooling-off is never shortened by our default.
 */
export function evaluateReapplyCooldown(input: {
  status: string | null | undefined;
  rejectedAt: Date | null | undefined;
  lenderCoolingOffUntil?: Date | null;
  coolingOffDays: number;
  now?: Date;
}): ReapplyCooldown {
  const none: ReapplyCooldown = { active: false, eligibleAt: null, daysRemaining: 0 };
  if (!input.status || !(REJECTED_APPLICATION_STATUSES as readonly string[]).includes(input.status)) return none;

  const now = input.now ?? new Date();
  const candidates: number[] = [];
  if (input.coolingOffDays > 0 && input.rejectedAt) {
    candidates.push(input.rejectedAt.getTime() + input.coolingOffDays * DAY_MS);
  }
  if (input.lenderCoolingOffUntil) candidates.push(input.lenderCoolingOffUntil.getTime());
  if (candidates.length === 0) return none;

  const eligibleAt = new Date(Math.max(...candidates));
  if (eligibleAt.getTime() <= now.getTime()) return { active: false, eligibleAt, daysRemaining: 0 };
  return {
    active: true,
    eligibleAt,
    daysRemaining: Math.ceil((eligibleAt.getTime() - now.getTime()) / DAY_MS),
  };
}
