/**
 * How long to wait before the next poll, given how long we have been polling.
 *
 * Quick at first, because lender stages usually finish within seconds and the customer is
 * watching a progress screen; then gentler, because a screen that is still waiting after a
 * minute or two is waiting on something slow (a lender or a human review) and gains nothing
 * from being asked every few seconds.
 */
export const pollDelayFor = (elapsedMs) => {
  if (elapsedMs < 15_000) return 3_000;
  if (elapsedMs < 90_000) return 5_000;
  return 10_000;
};

/**
 * Runs `task` repeatedly until the returned stop function is called.
 *
 * - Requests never overlap: the next poll is scheduled only after the previous one settles,
 *   so a slow network cannot pile up requests (a fixed setInterval used to).
 * - While the tab is hidden nothing is fetched, so a forgotten background tab stops hitting
 *   the server; the moment the tab is visible again it refreshes immediately.
 * - A failing task never stops the polling; the task reports its own errors.
 *
 * The clock, timers and document are injectable so this can be tested without a browser.
 */
export function startAdaptivePolling(
  task,
  {
    now = Date.now,
    schedule = setTimeout,
    cancel = clearTimeout,
    doc = typeof document !== 'undefined' ? document : null,
  } = {},
) {
  const startedAt = now();
  let timer = null;
  let stopped = false;
  let inFlight = false;

  const run = async () => {
    if (stopped || inFlight || doc?.hidden) return;
    inFlight = true;
    try {
      await task();
    } catch {
      // keep polling; the task is responsible for surfacing its own errors
    } finally {
      inFlight = false;
    }
  };

  const tick = () => {
    if (stopped) return;
    timer = schedule(async () => {
      await run();
      tick();
    }, pollDelayFor(now() - startedAt));
  };

  const onVisibilityChange = () => {
    if (doc && !doc.hidden) void run();
  };

  doc?.addEventListener('visibilitychange', onVisibilityChange);
  tick();

  return () => {
    stopped = true;
    cancel(timer);
    doc?.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
