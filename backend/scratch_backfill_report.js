const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillReport() {
  const rejectedApps = await prisma.plApplication.findMany({
    where: {
      status: 'PLATFORM_REJECTED',
    }
  });

  let totalInspected = rejectedApps.length;
  let missingDecisionAt = 0;
  let missingRequestedAmount = 0;
  let backfilled = 0;

  for (const app of rejectedApps) {
    let updateNeeded = false;
    let data = {};

    if (!app.platformDecisionAt) {
      missingDecisionAt++;
      data.platformDecisionAt = app.updatedAt;
      updateNeeded = true;
    }

    if (app.requestedAmount === null || app.requestedAmount === undefined) {
      missingRequestedAmount++;
      // Just for reporting, usually requestedAmount is strictly required now.
    }

    if (updateNeeded) {
      await prisma.plApplication.update({
        where: { id: app.id },
        data
      });
      backfilled++;
    }
  }

  console.log('--- Migration Backfill Report ---');
  console.log(`Total PLATFORM_REJECTED applications inspected: ${totalInspected}`);
  console.log(`Applications missing platformDecisionAt (mapped to updatedAt): ${missingDecisionAt}`);
  console.log(`Applications missing requestedAmount (fatal validation error candidates): ${missingRequestedAmount}`);
  console.log(`Rows successfully backfilled: ${backfilled}`);
  
  await prisma.$disconnect();
}

backfillReport().catch(e => {
  console.error(e);
  process.exit(1);
});
