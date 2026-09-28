/**
 * Optional error reporting. Does nothing unless BOTH are true: SENTRY_DSN is set and the
 * @sentry/node package is installed. So it costs nothing today, and turning it on later is
 * `npm i @sentry/node` plus setting the DSN - no code change.
 *
 * Reporting can never affect a request: any failure here (package missing, init error,
 * network) is swallowed, and after one failure it stays off for the life of the process.
 */
type SentryLike = {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown, hint?: Record<string, unknown>) => void;
};

let sentry: SentryLike | null | undefined;

export function reportException(error: unknown, context?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN || sentry === null) return;
  try {
    if (sentry === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sentry = require('@sentry/node') as SentryLike;
      sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV, tracesSampleRate: 0 });
    }
    sentry.captureException(error, { extra: context });
  } catch {
    sentry = null;
  }
}

/** Test hook: forget whether the package was found. */
export function resetErrorReporterForTests(): void {
  sentry = undefined;
}
