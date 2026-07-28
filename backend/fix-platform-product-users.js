const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const user = await prisma.user.findFirst();
  if (user) {
    try {
        await prisma.$executeRawUnsafe("UPDATE PlatformProduct SET createdById = '" + user.id + "', updatedById = '" + user.id + "' WHERE id = 'PLAT_PROD_001'");
        console.log('Updated PlatformProduct with valid User ID:', user.id);
    } catch(e) {
        console.log('Ignore if not exists:', e.message);
    }
  }
}
run().then(() => prisma.$disconnect());
