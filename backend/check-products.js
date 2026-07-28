const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const products = await prisma.lenderProduct.findMany({ include: { lender: true } });
  console.log('Lender Products:');
  products.forEach(p => console.log(`ID: ${p.id}, Code: ${p.code}, Lender: ${p.lender.name}`));
}
run().then(() => prisma.$disconnect());
