/*
 * Bypass the Account Aggregator (bank-statement) step for ONE application by
 * inserting a CustomerAccountAggregatorRequest row with status = 'SUCCESS'
 * (+ a dummy CustomerBankAccountData row so the UI success panel and the
 * status/refresh endpoints resolve cleanly).
 *
 * The backend gate (customer.service.ts -> nextPermittedStep) is ONLY:
 *   exists CustomerAccountAggregatorRequest
 *     where customerId = <cust> AND applicationId = <app> AND status = 'SUCCESS'
 *
 * Usage (from backend/):
 *   # dry run against prod - shows the newest application, writes nothing
 *   PROD_DB_URL='mysql://USER:PASS@HOST/DB' node bypass-account-aggregator.js
 *
 *   # target a specific application number instead of "newest"
 *   PROD_DB_URL='...' node bypass-account-aggregator.js --app APP-260902-XXXX
 *
 *   # actually write the bypass rows
 *   PROD_DB_URL='...' node bypass-account-aggregator.js --app APP-260902-XXXX --apply
 */
const { PrismaClient, Prisma } = require('@prisma/client');

const url = process.env.PROD_DB_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });
const j = (o) => JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const appArgIdx = args.indexOf('--app');
const APP_REF = appArgIdx !== -1 ? args[appArgIdx + 1] : null;

async function main() {
  const [{ db }] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS db');
  console.log(`DB: ${db}   mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);

  const application = APP_REF
    ? await prisma.plApplication.findFirst({ where: { OR: [{ applicationNumber: APP_REF }, { platformLan: APP_REF }] } })
    : await prisma.plApplication.findFirst({ orderBy: { id: 'desc' } });

  if (!application) throw new Error('Application not found' + (APP_REF ? ` for ${APP_REF}` : ''));

  const customer = await prisma.customer.findUnique({ where: { id: application.customerId } });

  console.log('\n=== TARGET ===');
  console.log(j({
    applicationId: application.id,
    applicationNumber: application.applicationNumber,
    platformLan: application.platformLan,
    status: application.status,
    createdAt: application.createdAt,
    customerId: customer.id,
    customerName: customer.fullName,
    mobile: customer.mobileNumber,
    email: customer.email,
  }));

  const existing = await prisma.customerAccountAggregatorRequest.findMany({
    where: { customerId: customer.id, applicationId: application.id },
  });
  console.log('\nexisting AA requests for this application:', j(existing.map((r) => ({ id: r.id, status: r.status, lan: r.lan, trackingId: r.trackingId }))));

  if (existing.some((r) => r.status === 'SUCCESS')) {
    console.log('\n>>> Already has a SUCCESS AA request. Nothing to do.');
    return;
  }

  const lan = application.platformLan || application.applicationNumber;
  const now = new Date();
  const trackingId = `MANUAL-BYPASS-${application.id}-${Date.now()}`;

  console.log('\n=== WILL INSERT ===');
  console.log(j({
    CustomerAccountAggregatorRequest: {
      customerId: customer.id, applicationId: application.id, lan, provider: 'UNAPORT',
      trackingId, status: 'SUCCESS', consentStatus: 'APPROVED', dataStatus: 'COMPLETED',
      initiatedAt: now, consentedAt: now, dataReadyAt: now, completedAt: now,
    },
    CustomerBankAccountData: {
      lan, provider: 'UNAPORT', fipName: 'DUMMY BANK', accountType: 'SAVINGS',
      accountNumberMasked: 'XXXXXX0000', accountHolderName: customer.fullName || 'CUSTOMER',
      ifscCode: 'DUMY0000000', currency: 'INR',
      currentBalance: '100000.00', availableBalance: '100000.00', averageBalance: '100000.00',
    },
  }));

  if (!APPLY) {
    console.log('\nDRY RUN - re-run with --apply to write the above.');
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const req = await tx.customerAccountAggregatorRequest.create({
      data: {
        customerId: customer.id,
        applicationId: application.id,
        lan,
        provider: 'UNAPORT',
        trackingId,
        status: 'SUCCESS',
        consentStatus: 'APPROVED',
        dataStatus: 'COMPLETED',
        initiatedAt: now,
        consentedAt: now,
        dataReadyAt: now,
        completedAt: now,
      },
    });

    const bank = await tx.customerBankAccountData.create({
      data: {
        requestId: req.id,
        customerId: customer.id,
        applicationId: application.id,
        lan,
        provider: 'UNAPORT',
        fipName: 'DUMMY BANK',
        accountType: 'SAVINGS',
        accountNumberMasked: 'XXXXXX0000',
        accountHolderName: customer.fullName || 'CUSTOMER',
        ifscCode: 'DUMY0000000',
        branchName: 'DUMMY BRANCH',
        currency: 'INR',
        currentBalance: new Prisma.Decimal('100000.00'),
        availableBalance: new Prisma.Decimal('100000.00'),
        averageBalance: new Prisma.Decimal('100000.00'),
        summaryDate: now,
      },
    });

    return { req, bank };
  });

  console.log('\n=== WROTE ===');
  console.log('AA request id:', result.req.id.toString(), 'status:', result.req.status);
  console.log('bank data id:', result.bank.id.toString());
  console.log('\nDone. The customer app should now skip the Account Aggregator step.');
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); }).finally(() => prisma.$disconnect());
