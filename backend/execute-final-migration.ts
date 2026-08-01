import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration...');
  
  const defaultProduct = await prisma.platformProduct.findFirst();
  if (!defaultProduct) {
    console.error('No platform product found to backfill.');
    return;
  }
  
  console.log(`Backfilling with product ID: ${defaultProduct.id}`);
  
  // 1. Backfill platformProductId from Customer or any default product if null using raw SQL
  await prisma.$executeRawUnsafe(`
    UPDATE pl_applications 
    SET platform_product_id = '${defaultProduct.id}' 
    WHERE platform_product_id IS NULL;
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE pl_applications 
    SET scope_code = 'DEFAULT' 
    WHERE scope_code IS NULL;
  `);
  
  console.log('Backfill completed. Altering table PlApplication...');
  // 2. Alter table to add NOT NULL constraint
  await prisma.$executeRawUnsafe(`
    ALTER TABLE pl_applications 
    MODIFY COLUMN platform_product_id VARCHAR(50) NOT NULL,
    MODIFY COLUMN scope_code VARCHAR(60) NOT NULL;
  `);
  
  console.log('Migration successfully completed.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
