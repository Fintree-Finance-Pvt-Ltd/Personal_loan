const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

if (!schema.includes('lastAllocatedAt')) {
  schema = schema.replace(
    'allocatedAmount Decimal @default(0) @db.Decimal(16, 2)',
    'allocatedAmount Decimal @default(0) @db.Decimal(16, 2)\n  lastAllocatedAt DateTime?'
  );
  fs.writeFileSync('prisma/schema.prisma', schema);
  console.log('Added lastAllocatedAt');
}
