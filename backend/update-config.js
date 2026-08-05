const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.lenderIntegrationConfig.updateMany({
    where: {
      lenderId: 'cms62saaa0001tsmcksp92trc'
    },
    data: {
      credentialSecretReference: 'FINTREE_API_KEY',
      consentPath: '/api/partner/v1/applications/{partnerApplicationId}/consent',
      documentUploadPath: '/api/partner/v1/applications/{partnerApplicationId}/docs'
    }
  });
  console.log('Updated Fintree config paths and secret reference');
}

main().catch(console.error).finally(() => prisma.$disconnect());
