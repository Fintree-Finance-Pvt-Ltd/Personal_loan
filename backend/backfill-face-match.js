/*
 * Backfills the Digitap face match for applications that completed before the feature
 * existed (live selfie vs the photo on the DigiLocker Aadhaar).
 *
 * MUST BE RUN ON THE SERVER THAT HOLDS THE UPLOADS DIRECTORY. The selfies and Aadhaar
 * PDFs are read off local disk, so running this from a laptop against a remote DB records
 * SKIPPED ("missing on disk") for every row.
 *
 * It drives the real FaceMatchService, so a backfilled result is byte-for-byte what the
 * automatic post-KYC run would have produced. It deliberately does NOT boot the whole Nest
 * app — that would also start the lender-integration outbox worker and the Easebuzz crons
 * against whatever DATABASE_URL is set.
 *
 * Usage (from backend/):
 *   node backfill-face-match.js                    # dry run: lists what it would process
 *   node backfill-face-match.js --limit 5 --apply  # process the 5 newest eligible apps
 *   node backfill-face-match.js --apply            # process everything eligible
 *   node backfill-face-match.js --app 83 --apply   # one application by id
 *   node backfill-face-match.js --apply --force    # also redo apps already scored
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const { from } = require('rxjs');
const { FaceMatchService } = require('./dist/modules/external-api/face-match.service');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
};

const APPLY = flag('apply');
const FORCE = flag('force');
const LIMIT = value('limit') ? Number(value('limit')) : null;
const APP_ID = value('app') ? BigInt(value('app')) : null;
// Digitap is a paid per-call API and this can be a few hundred rows — stay polite.
const DELAY_MS = value('delay') ? Number(value('delay')) : 400;

const prisma = new PrismaClient();

// Minimal stand-ins for the Nest providers FaceMatchService expects, so the service's real
// logic runs without an application context.
const httpShim = { post: (url, data, config) => from(axios.post(url, data, config)) };
const configShim = {
  get: (key, fallback) => process.env[key] ?? fallback,
  getOrThrow: (key) => {
    if (!process.env[key]) throw new Error(`Missing required env var ${key}`);
    return process.env[key];
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const [{ db }] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS db');
  console.log(`DB: ${db}`);
  console.log(`Endpoint: ${process.env.FACE_MATCH_API_URL || '(derived from FACE_LIVENESS_API_URL)'}`);
  console.log(`Mode: ${APPLY ? 'APPLY (calls Digitap, writes results)' : 'DRY RUN (no calls, no writes)'}${FORCE ? ' +FORCE' : ''}\n`);

  const applications = await prisma.plApplication.findMany({
    where: APP_ID ? { id: APP_ID } : {},
    orderBy: { id: 'desc' },
    select: { id: true, applicationNumber: true, customerId: true, status: true },
  });

  // Only applications whose customer has BOTH inputs on file are worth a paid API call.
  const eligible = [];
  const ineligible = [];
  for (const app of applications) {
    const [selfie, aadhaar, existing] = await Promise.all([
      prisma.plCustomerDocument.findFirst({
        where: { customerId: app.customerId, documentType: 'CUSTOMER_LIVE_PHOTO', status: 'VERIFIED' },
        select: { id: true },
      }),
      prisma.plCustomerDocument.findFirst({
        where: { customerId: app.customerId, documentType: 'AADHAAR_CARD', status: 'VERIFIED' },
        select: { id: true },
      }),
      prisma.applicationFaceMatch.findUnique({
        where: { applicationId: app.id },
        select: { status: true },
      }),
    ]);

    if (!selfie || !aadhaar) {
      ineligible.push({ ...app, reason: !selfie ? 'no live photo' : 'no Aadhaar document' });
      continue;
    }
    if (existing && ['MATCHED', 'NOT_MATCHED'].includes(existing.status) && !FORCE) {
      ineligible.push({ ...app, reason: `already ${existing.status} (use --force to redo)` });
      continue;
    }
    eligible.push(app);
  }

  const targets = LIMIT ? eligible.slice(0, LIMIT) : eligible;

  console.log(`${applications.length} application(s) examined`);
  console.log(`  eligible : ${eligible.length}${LIMIT ? ` (processing first ${targets.length})` : ''}`);
  console.log(`  skipped  : ${ineligible.length}\n`);

  if (ineligible.length) {
    console.log('Not eligible:');
    for (const app of ineligible.slice(0, 30)) {
      console.log(`  ${app.applicationNumber.padEnd(24)} ${app.reason}`);
    }
    if (ineligible.length > 30) console.log(`  ... and ${ineligible.length - 30} more`);
    console.log('');
  }

  if (!targets.length) {
    console.log('Nothing to process.');
    return;
  }

  if (!APPLY) {
    console.log('Would process:');
    for (const app of targets) {
      console.log(`  ${app.applicationNumber.padEnd(24)} app=${app.id}  customer=${app.customerId}  ${app.status}`);
    }
    console.log('\nDRY RUN — re-run with --apply to call Digitap and store results.');
    return;
  }

  const service = new FaceMatchService(prisma, httpShim, configShim);
  const tally = { MATCHED: 0, NOT_MATCHED: 0, SKIPPED: 0, ERROR: 0 };

  for (const [index, app] of targets.entries()) {
    process.stdout.write(`[${index + 1}/${targets.length}] ${app.applicationNumber.padEnd(24)} `);
    try {
      const result = await service.runForApplication(app.id, { force: true });
      tally[result.status] = (tally[result.status] || 0) + 1;
      const confidence =
        result.sameFaceConfidence != null ? ` conf=${Number(result.sameFaceConfidence).toFixed(4)}` : '';
      const why = result.failureReason ? `  (${result.failureReason})` : '';
      console.log(`${result.status}${confidence}${why}`);
    } catch (error) {
      tally.ERROR += 1;
      console.log(`ERROR ${error.message}`);
    }
    if (index < targets.length - 1) await sleep(DELAY_MS);
  }

  console.log('\n=== SUMMARY ===');
  for (const [status, count] of Object.entries(tally)) {
    if (count) console.log(`  ${status.padEnd(12)} ${count}`);
  }
  console.log('\nResults are visible on each application in Credit Review.');
}

main()
  .catch((error) => {
    console.error('FAILED:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
