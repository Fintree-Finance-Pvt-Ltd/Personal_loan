const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.lenderIntegrationConfig.updateMany({
    where: {
      lenderId: 'cms62saaa0001tsmcksp92trc'
    },
    data: {
      baseUrl: 'https://uat.fintreelms.com/api',
      decisionPath: '/api/partner/v1/applications/{partnerApplicationId}/pre-approval'
    }
  });
  console.log('Updated Fintree config baseUrl and decisionPath');
}

main().catch(console.error).finally(() => prisma.$disconnect());
