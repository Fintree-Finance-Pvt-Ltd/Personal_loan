const { PrismaClient } = require('@prisma/client');
const { randomBytes } = require('crypto');
const prisma = new PrismaClient();

function generateId() {
  // cuid-shaped (not a real cuid, just avoids colliding with Prisma's format expectations)
  return 'c' + Date.now().toString(36) + randomBytes(8).toString('hex');
}

async function main() {
  const badConfig = await prisma.lenderIntegrationConfig.findUnique({ where: { id: '' } });
  if (!badConfig) {
    console.log('No LenderIntegrationConfig row with empty id found. Nothing to do.');
    return;
  }

  const affectedLinksBefore = await prisma.lenderApplicationLink.findMany({
    where: { integrationConfigId: '' },
    select: { id: true },
  });
  console.log(`Found config with empty id (lenderId=${badConfig.lenderId}), referenced by ${affectedLinksBefore.length} link(s).`);

  const newId = generateId();

  // Update the PK in place; fk_lender_link_config is ON UPDATE CASCADE so
  // LenderApplicationLink.integrationConfigId repoints automatically.
  const updated = await prisma.$executeRawUnsafe(
    'UPDATE `LenderIntegrationConfig` SET `id` = ? WHERE `id` = ?',
    newId,
    '',
  );
  console.log(`Renamed config id: '' -> ${newId} (rows affected: ${updated})`);

  const stillEmpty = await prisma.lenderIntegrationConfig.count({ where: { id: '' } });
  const nowPointing = await prisma.lenderApplicationLink.count({ where: { integrationConfigId: newId } });
  console.log(`Configs still with empty id: ${stillEmpty}`);
  console.log(`Links now pointing at new config id: ${nowPointing}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
