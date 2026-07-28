const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

if (!schema.includes('model MlmAllocationRouteState')) {
  schema += "\n" + `model MlmAllocationRouteState {
  id String @id @default(cuid())

  mlmPolicyVersionId String
  routeId String @unique

  currentWeight Decimal @db.Decimal(12, 4) @default(0)
  allocatedApplicationCount Int @default(0)
  allocatedAmount Decimal @default(0) @db.Decimal(16, 2)

  version Int @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  policyVersion MlmPolicyVersion @relation(fields: [mlmPolicyVersionId], references: [id], onDelete: Cascade)
  route MlmAllocationRoute @relation(fields: [routeId], references: [id], onDelete: Cascade)

  @@index([mlmPolicyVersionId])
}`;

  // Add relations
  schema = schema.replace(
    'routes    MlmAllocationRoute[]',
    'routes    MlmAllocationRoute[]\n  routeStates MlmAllocationRouteState[]'
  );
  schema = schema.replace(
    'decisions MlmAllocationDecision[]\n\n  @@unique([mlmPolicyVersionId, lenderId, productId, customerSegment])',
    'decisions MlmAllocationDecision[]\n  routeState MlmAllocationRouteState?\n\n  @@unique([mlmPolicyVersionId, lenderId, productId, customerSegment])'
  );

  fs.writeFileSync('prisma/schema.prisma', schema);
  console.log('Added MlmAllocationRouteState');
} else {
  console.log('MlmAllocationRouteState already exists');
}
