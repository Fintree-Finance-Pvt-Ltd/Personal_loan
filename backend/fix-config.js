const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.lenderIntegrationConfig.updateMany({
    where: {
      lenderId: 'cms62saaa0001tsmcksp92trc'
    },
    data: {
      adapterKey: 'FINTREE_FINANCE_V1',
      adapterVersion: '1'
    }
  });
  console.log('Updated Fintree config');
}

main().catch(console.error).finally(() => prisma.$disconnect());
