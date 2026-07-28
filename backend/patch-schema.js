const fs = require('fs');
const path = require('path');
const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');

let s = fs.readFileSync(schemaPath, 'utf8');

const modelsToAdd = `
enum MlmPolicyOperationalStatus {
  INACTIVE
  ACTIVE
}

enum MlmPolicyVersionStatus {
  DRAFT
  SUBMITTED
  APPROVED
  REJECTED
  ACTIVE
  SUPERSEDED
}

enum MlmAllocationMethod {
  WEIGHTED_FAIR_SHARE
  PRIORITY_FALLBACK
}

enum MlmDistributionBasis {
  APPLICATION_COUNT
  ALLOCATED_AMOUNT
}

enum MlmCustomerSegment {
  ALL
  NEW
  REPEAT
}

enum MlmCapacityPeriod {
  DAILY
  MONTHLY
}

enum MlmAllocationDecisionStatus {
  PENDING
  ASSIGNED
  NO_ELIGIBLE_ROUTE
}

enum MlmAllocationAttemptOutcome {
  ASSIGNED
  NO_ELIGIBLE_ROUTE
  REJECTED_BY_PLATFORM_POLICY
  ERROR
}

model MlmPolicy {
  id                String                     @id @default(cuid())
  name              String                     @db.VarChar(150)
  code              String                     @unique @db.VarChar(60)
  description       String?                    @db.VarChar(500)
  scopeCode         String                     @default("PLATFORM_DEFAULT") @db.VarChar(60)
  operationalStatus MlmPolicyOperationalStatus @default(INACTIVE)

  createdById       String
  updatedById       String

  createdAt         DateTime                   @default(now())
  updatedAt         DateTime                   @updatedAt

  createdBy User @relation("MlmPolicyCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy User @relation("MlmPolicyUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)

  versions          MlmPolicyVersion[]
  decisions         MlmAllocationDecision[]

  @@index([scopeCode, operationalStatus])
  @@index([operationalStatus, updatedAt])
}

model MlmPolicyVersion {
  id                String                 @id @default(cuid())
  policyId          String
  versionNumber     Int
  status            MlmPolicyVersionStatus @default(DRAFT)

  allocationMethod  MlmAllocationMethod
  distributionBasis MlmDistributionBasis?
  effectiveFrom     DateTime?
  version           Int                    @default(1)

  createdById       String
  updatedById       String
  submittedById     String?
  approvedById      String?
  rejectedById      String?
  activatedById     String?

  submittedAt       DateTime?
  approvedAt        DateTime?
  rejectedAt        DateTime?
  activatedAt       DateTime?
  rejectionReason   String?                @db.VarChar(500)

  createdAt         DateTime               @default(now())
  updatedAt         DateTime               @updatedAt

  policy MlmPolicy @relation(fields: [policyId], references: [id], onDelete: Restrict)

  routes       MlmAllocationRoute[]
  decisions    MlmAllocationDecision[]
  attempts     MlmAllocationAttempt[]

  createdBy User @relation("MlmPolicyVersionCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy User @relation("MlmPolicyVersionUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)
  submittedBy User? @relation("MlmPolicyVersionSubmittedBy", fields: [submittedById], references: [id], onDelete: SetNull)
  approvedBy User? @relation("MlmPolicyVersionApprovedBy", fields: [approvedById], references: [id], onDelete: SetNull)
  rejectedBy User? @relation("MlmPolicyVersionRejectedBy", fields: [rejectedById], references: [id], onDelete: SetNull)
  activatedBy User? @relation("MlmPolicyVersionActivatedBy", fields: [activatedById], references: [id], onDelete: SetNull)

  @@unique([policyId, versionNumber])
  @@index([policyId, status])
  @@index([status, updatedAt])
}

model MlmAllocationRoute {
  id                      String             @id @default(cuid())
  mlmPolicyVersionId      String

  lenderId                String
  productId               String

  customerSegment         MlmCustomerSegment @default(ALL)

  allocationWeightPercent Decimal?           @db.Decimal(7, 4)
  priority                Int

  minimumTicketAmount     Decimal?           @db.Decimal(12, 2)
  maximumTicketAmount     Decimal?           @db.Decimal(12, 2)

  capacityPeriod          MlmCapacityPeriod
  maximumApplicationCount Int?
  maximumAllocatedAmount  Decimal?           @db.Decimal(16, 2)

  isActive                Boolean            @default(true)
  sortOrder               Int

  createdAt               DateTime           @default(now())
  updatedAt               DateTime           @updatedAt

  policyVersion MlmPolicyVersion @relation(fields: [mlmPolicyVersionId], references: [id], onDelete: Cascade)
  lender Lender @relation(fields: [lenderId], references: [id], onDelete: Restrict)
  product LenderProduct @relation(fields: [productId], references: [id], onDelete: Restrict)

  decisions MlmAllocationDecision[]

  @@unique([mlmPolicyVersionId, lenderId, productId, customerSegment])
  @@unique([mlmPolicyVersionId, sortOrder])
  @@index([mlmPolicyVersionId, isActive])
  @@index([lenderId, productId])
  @@index([customerSegment])
}

model MlmCapacityUsage {
  id                        String            @id @default(cuid())

  lenderId                  String
  productId                 String
  capacityPeriod            MlmCapacityPeriod

  periodKey                 String            @db.VarChar(20)
  periodStart               DateTime
  periodEnd                 DateTime

  allocatedApplicationCount Int               @default(0)
  allocatedAmount           Decimal           @default(0) @db.Decimal(16, 2)

  version                   Int               @default(1)
  createdAt                 DateTime          @default(now())
  updatedAt                 DateTime          @updatedAt

  lender Lender @relation(fields: [lenderId], references: [id], onDelete: Restrict)
  product LenderProduct @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@unique([lenderId, productId, capacityPeriod, periodKey])
  @@index([periodStart, periodEnd])
  @@index([lenderId, productId])
}

model MlmAllocationDecision {
  id                         String                       @id @default(cuid())
  applicationReference       String                       @unique @db.VarChar(100)

  policyId                   String?
  policyVersionId            String?
  routeId                    String?

  lenderId                   String?
  productId                  String?
  productVersionId           String?

  platformPolicyVersionId    String?
  platformEvaluationReference String?

  requestedAmount            Decimal                      @db.Decimal(12, 2)
  customerSegment            MlmCustomerSegment
  platformDecisionOutcome    PolicyDecisionOutcome

  status                     MlmAllocationDecisionStatus  @default(PENDING)
  allocationMethod           MlmAllocationMethod?
  distributionBasis          MlmDistributionBasis?

  selectedWeightPercent      Decimal?                     @db.Decimal(7, 4)
  selectedPriority           Int?

  capacityPeriod             MlmCapacityPeriod?
  capacityPeriodKey          String?                      @db.VarChar(20)

  attemptCount               Int                          @default(0)
  decisionReasonCode         String?                      @db.VarChar(100)
  decisionSnapshot           Json?

  assignedAt                 DateTime?
  createdAt                  DateTime                     @default(now())
  updatedAt                  DateTime                     @updatedAt

  policy MlmPolicy? @relation(fields: [policyId], references: [id], onDelete: SetNull)
  policyVersion MlmPolicyVersion? @relation(fields: [policyVersionId], references: [id], onDelete: SetNull)
  route MlmAllocationRoute? @relation(fields: [routeId], references: [id], onDelete: SetNull)
  lender Lender? @relation(fields: [lenderId], references: [id], onDelete: SetNull)
  product LenderProduct? @relation(fields: [productId], references: [id], onDelete: SetNull)

  attempts MlmAllocationAttempt[]

  @@index([status, createdAt])
  @@index([lenderId, productId])
  @@index([policyVersionId])
}

model MlmAllocationAttempt {
  id                    String                      @id @default(cuid())
  decisionId            String
  policyVersionId       String?

  attemptNumber         Int
  outcome               MlmAllocationAttemptOutcome

  requestedAmount       Decimal                     @db.Decimal(12, 2)
  candidateResults      Json
  selectedRouteId       String?
  reasonCode            String?                     @db.VarChar(100)

  createdAt             DateTime                    @default(now())

  decision MlmAllocationDecision @relation(fields: [decisionId], references: [id], onDelete: Cascade)
  policyVersion MlmPolicyVersion? @relation(fields: [policyVersionId], references: [id], onDelete: SetNull)

  @@unique([decisionId, attemptNumber])
  @@index([decisionId, createdAt])
}
`;

if (!s.includes('MlmPolicy')) {
  s += '\n' + modelsToAdd + '\n';
  
  s = s.replace(/model User \{[^}]+\}/, match => {
    return match.replace(/}$/, '  mlmPoliciesCreated MlmPolicy[] @relation("MlmPolicyCreatedBy")\n  mlmPoliciesUpdated MlmPolicy[] @relation("MlmPolicyUpdatedBy")\n\n  mlmPolicyVersionsCreated MlmPolicyVersion[] @relation("MlmPolicyVersionCreatedBy")\n  mlmPolicyVersionsUpdated MlmPolicyVersion[] @relation("MlmPolicyVersionUpdatedBy")\n  mlmPolicyVersionsSubmitted MlmPolicyVersion[] @relation("MlmPolicyVersionSubmittedBy")\n  mlmPolicyVersionsApproved MlmPolicyVersion[] @relation("MlmPolicyVersionApprovedBy")\n  mlmPolicyVersionsRejected MlmPolicyVersion[] @relation("MlmPolicyVersionRejectedBy")\n  mlmPolicyVersionsActivated MlmPolicyVersion[] @relation("MlmPolicyVersionActivatedBy")\n}');
  });
  
  s = s.replace(/model Lender \{[^}]+\}/, match => {
    return match.replace(/}$/, '  mlmAllocationRoutes MlmAllocationRoute[]\n  mlmCapacityUsages MlmCapacityUsage[]\n  mlmAllocationDecisions MlmAllocationDecision[]\n}');
  });
  
  s = s.replace(/model LenderProduct \{[^}]+\}/, match => {
    return match.replace(/}$/, '  mlmAllocationRoutes MlmAllocationRoute[]\n  mlmCapacityUsages MlmCapacityUsage[]\n  mlmAllocationDecisions MlmAllocationDecision[]\n}');
  });

  fs.writeFileSync(schemaPath, s);
  console.log('Appended models and relations successfully.');
} else {
  console.log('Models already exist.');
}
