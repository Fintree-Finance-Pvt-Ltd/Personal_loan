const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const file = 'prisma/migrations/20260728000000_add_platform_product_mapping_and_product_scoped_mlm/migration2.sql';
  const sql = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/g, '').replace(/\uFEFF/g, '');
  const statements = sql.split(';');
  for (const stmt of statements) {
    const s = stmt.trim();
    if (!s) continue;
    console.log('--- Executing ---');
    console.log(s.substring(0, 100).replace(/\n/g, ' '));
    try {
      await prisma.$executeRawUnsafe(s);
    } catch (e) {
      console.log('Error:', e.message.substring(0, 200));
    }
  }
}
run().then(() => prisma.$disconnect());
