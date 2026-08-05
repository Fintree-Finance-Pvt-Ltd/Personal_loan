const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.lenderIntegrationConfig.findMany().then(console.log).finally(() => prisma.$disconnect());
