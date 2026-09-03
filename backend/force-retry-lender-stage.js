/*
 * Forces a failed / waiting lender-integration stage to be retried immediately.
 *
 * RUN ON THE SERVER whose worker owns the queue (the worker polls every
 * LENDER_INTEGRATION_WORKER_POLL_MS, default 5s, so a forced event fires within seconds).
 *
 * Why this exists alongside the admin UI's Retry button: that button (and the
 * /admin/lender-integrations/events/:id/replay endpoint behind it) only accepts events in
 * status FAILED. An event in RETRY_PENDING still has attempts left and is simply waiting
 * for availableAt — the retry schedule is 0,60,300,900,3600s, so the last wait is an hour.
 * This script pulls availableAt forward and resets the attempt counter for both cases.
 *
 * Usage (from backend/):
 *   node force-retry-lender-stage.js --name piyush              # diagnose only
 *   node force-retry-lender-stage.js --name piyush --apply      # force its stages to retry now
 *   node force-retry-lender-stage.js --app 83 --stage UPDATE --apply
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 ? args[i + 1] : null;
};

const APPLY = flag('apply');
const NAME = value('name');
const APP_ID = value('app') ? BigInt(value('app')) : null;
const STAGE = value('stage') ? value('stage').toUpperCase() : null;

const prisma = new PrismaClient();
const j = (o) => JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

async function main() {
  const [{ db }] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS db');
  console.log(`DB: ${db}   Mode: ${APPLY ? 'APPLY' : 'DIAGNOSE ONLY'}\n`);

  if (!NAME && !APP_ID) {
    console.error('Pass --name <customer name> or --app <applicationId>.');
    process.exit(1);
  }

  let applications;
  if (APP_ID) {
    applications = await prisma.plApplication.findMany({ where: { id: APP_ID } });
  } else {
    const customers = await prisma.customer.findMany({
      where: { fullName: { contains: NAME } },
      select: { id: true, fullName: true, mobileNumber: true, email: true },
    });
    if (!customers.length) {
      console.log(`No customer matching "${NAME}".`);
      return;
    }
    console.log('Matched customers:');
    for (const c of customers) {
      console.log(`  id=${c.id}  ${c.fullName}  ${c.mobileNumber || ''}  ${c.email || ''}`);
    }
    console.log('');
    applications = await prisma.plApplication.findMany({
      where: { customerId: { in: customers.map((c) => c.id) } },
      orderBy: { id: 'desc' },
    });
  }

  if (!applications.length) {
    console.log('No applications found.');
    return;
  }

  const forced = [];

  for (const app of applications) {
    console.log(`========== ${app.applicationNumber}  (app id ${app.id}) ==========`);
    console.log(`  status: ${app.status}   platformLan: ${app.platformLan || '-'}`);

    const link = await prisma.lenderApplicationLink.findUnique({ where: { applicationId: app.id } });
    if (link) {
      console.log(`  link stages: create=${link.createStatus} consent=${link.consentStatus} update=${link.updateStatus} decision=${link.decisionStatus}`);
      console.log(`  partnerApplicationId: ${link.partnerApplicationId || '-'}`);
      if (link.lastErrorCode) console.log(`  link lastError: ${link.lastErrorCode} — ${link.lastErrorMessage}`);
    } else {
      console.log('  link: none');
    }

    const events = await prisma.lenderIntegrationOutbox.findMany({
      where: { applicationId: app.id, ...(STAGE ? { integrationStage: STAGE } : {}) },
      orderBy: { createdAt: 'asc' },
    });

    if (!events.length) {
      console.log('  outbox: no events\n');
      continue;
    }

    console.log('  outbox events:');
    for (const e of events) {
      const waiting =
        e.availableAt > new Date()
          ? `  (next attempt in ${Math.ceil((e.availableAt - Date.now()) / 1000)}s)`
          : '';
      console.log(`    ${e.integrationStage.padEnd(9)} ${e.status.padEnd(14)} attempts=${e.attemptCount}${waiting}`);
      if (e.lastErrorCode) console.log(`      error: ${e.lastErrorCode} — ${e.lastErrorMessage}`);

      // PROCESSING is deliberately left alone: a worker may still hold the lease on it,
      // and resetting it underneath would let two workers run the same call twice.
      if (['FAILED', 'RETRY_PENDING'].includes(e.status)) forced.push({ event: e, app, link });
      else if (e.status === 'PROCESSING') console.log('      (in flight — not touched)');
    }
    console.log('');
  }

  if (!forced.length) {
    console.log('Nothing is in FAILED or RETRY_PENDING, so there is nothing to force.');
    return;
  }

  console.log(`${forced.length} event(s) can be forced to retry now:`);
  for (const { event, app } of forced) {
    console.log(`  ${app.applicationNumber}  ${event.integrationStage}  (${event.status})`);
  }

  if (!APPLY) {
    console.log('\nDIAGNOSE ONLY — re-run with --apply to force these.');
    console.log('NOTE: read the error above first. A config error (bad host, bad credentials)');
    console.log('will just fail again on retry until the underlying cause is fixed.');
    return;
  }

  for (const { event, app, link } of forced) {
    await prisma.$transaction(async (tx) => {
      await tx.lenderIntegrationOutbox.update({
        where: { id: event.id },
        data: {
          status: 'PENDING',
          attemptCount: 0,
          availableAt: new Date(),
          processedAt: null,
          lockedAt: null,
          lockedBy: null,
          lockToken: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

      // Mirror the stage's own status column on the link, the way replayFailedEvent does,
      // so the admin UI doesn't keep showing the stale FAILED badge. DISBURSE has no such
      // column — it tracks state on PlLoan.disbursalStatus instead.
      if (link && event.integrationStage !== 'DISBURSE') {
        const field =
          event.integrationStage === 'CREATE'
            ? 'createStatus'
            : event.integrationStage === 'CONSENT'
              ? 'consentStatus'
              : event.integrationStage === 'UPDATE'
                ? 'updateStatus'
                : 'decisionStatus';
        await tx.lenderApplicationLink.update({
          where: { id: link.id },
          data: { [field]: 'PENDING', lastErrorCode: null, lastErrorMessage: null },
        });
      }
    });
    console.log(`  forced: ${app.applicationNumber} ${event.integrationStage}`);
  }

  console.log('\nDone. The worker polls every LENDER_INTEGRATION_WORKER_POLL_MS (default 5s),');
  console.log('so these should be picked up within seconds. Re-run without --apply to check.');
}

main()
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
