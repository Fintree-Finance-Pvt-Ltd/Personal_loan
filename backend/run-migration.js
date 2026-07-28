const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const file = 'prisma/migrations/20260728000000_add_platform_product_mapping_and_product_scoped_mlm/migration.sql';
  const sql = fs.readFileSync(file, 'utf8');
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  
  for (const statement of statements) {
    if (statement.startsWith('--')) {
        const lines = statement.split('\n');
        const codeLines = lines.filter(l => !l.startsWith('--') && l.trim().length > 0);
        if (codeLines.length === 0) continue;
    }
    
    console.log('Executing:', statement.substring(0, 50).replace(/\n/g, ' ') + '...');
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (e) {
      console.error('Error on statement:', e.message);
      break;
    }
  }
}

run().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
