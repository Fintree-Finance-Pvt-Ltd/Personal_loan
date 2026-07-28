-- CreateTable
CREATE TABLE `MlmPolicy` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `description` VARCHAR(500) NULL,
    `scopeCode` VARCHAR(60) NOT NULL DEFAULT 'PLATFORM_DEFAULT',
    `operationalStatus` ENUM('INACTIVE', 'ACTIVE') NOT NULL DEFAULT 'INACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MlmPolicy_code_key`(`code`),
    INDEX `MlmPolicy_scopeCode_operationalStatus_idx`(`scopeCode`, `operationalStatus`),
    INDEX `MlmPolicy_operationalStatus_updatedAt_idx`(`operationalStatus`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmPolicyVersion` (
    `id` VARCHAR(191) NOT NULL,
    `policyId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
    `allocationMethod` ENUM('WEIGHTED_FAIR_SHARE', 'PRIORITY_FALLBACK') NOT NULL,
    `distributionBasis` ENUM('APPLICATION_COUNT', 'ALLOCATED_AMOUNT') NULL,
    `effectiveFrom` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `submittedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `rejectedById` VARCHAR(191) NULL,
    `activatedById` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `activatedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MlmPolicyVersion_policyId_status_idx`(`policyId`, `status`),
    INDEX `MlmPolicyVersion_status_updatedAt_idx`(`status`, `updatedAt`),
    UNIQUE INDEX `MlmPolicyVersion_policyId_versionNumber_key`(`policyId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmAllocationRoute` (
    `id` VARCHAR(191) NOT NULL,
    `mlmPolicyVersionId` VARCHAR(191) NOT NULL,
    `lenderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `customerSegment` ENUM('ALL', 'NEW', 'REPEAT') NOT NULL DEFAULT 'ALL',
    `allocationWeightPercent` DECIMAL(7, 4) NULL,
    `priority` INTEGER NOT NULL,
    `minimumTicketAmount` DECIMAL(12, 2) NULL,
    `maximumTicketAmount` DECIMAL(12, 2) NULL,
    `capacityPeriod` ENUM('DAILY', 'MONTHLY') NOT NULL,
    `maximumApplicationCount` INTEGER NULL,
    `maximumAllocatedAmount` DECIMAL(16, 2) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MlmAllocationRoute_mlmPolicyVersionId_isActive_idx`(`mlmPolicyVersionId`, `isActive`),
    INDEX `MlmAllocationRoute_lenderId_productId_idx`(`lenderId`, `productId`),
    INDEX `MlmAllocationRoute_customerSegment_idx`(`customerSegment`),
    UNIQUE INDEX `MlmAllocationRoute_mlmPolicyVersionId_lenderId_productId_cus_key`(`mlmPolicyVersionId`, `lenderId`, `productId`, `customerSegment`),
    UNIQUE INDEX `MlmAllocationRoute_mlmPolicyVersionId_sortOrder_key`(`mlmPolicyVersionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmCapacityUsage` (
    `id` VARCHAR(191) NOT NULL,
    `lenderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `capacityPeriod` ENUM('DAILY', 'MONTHLY') NOT NULL,
    `periodKey` VARCHAR(20) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `allocatedApplicationCount` INTEGER NOT NULL DEFAULT 0,
    `allocatedAmount` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MlmCapacityUsage_periodStart_periodEnd_idx`(`periodStart`, `periodEnd`),
    INDEX `MlmCapacityUsage_lenderId_productId_idx`(`lenderId`, `productId`),
    UNIQUE INDEX `MlmCapacityUsage_lenderId_productId_capacityPeriod_periodKey_key`(`lenderId`, `productId`, `capacityPeriod`, `periodKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmAllocationDecision` (
    `id` VARCHAR(191) NOT NULL,
    `applicationReference` VARCHAR(100) NOT NULL,
    `policyId` VARCHAR(191) NULL,
    `policyVersionId` VARCHAR(191) NULL,
    `routeId` VARCHAR(191) NULL,
    `lenderId` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NULL,
    `productVersionId` VARCHAR(191) NULL,
    `platformPolicyVersionId` VARCHAR(191) NULL,
    `platformEvaluationReference` VARCHAR(191) NULL,
    `requestedAmount` DECIMAL(12, 2) NOT NULL,
    `customerSegment` ENUM('ALL', 'NEW', 'REPEAT') NOT NULL,
    `platformDecisionOutcome` ENUM('PASS', 'FAIL', 'REFER') NOT NULL,
    `status` ENUM('PENDING', 'ASSIGNED', 'NO_ELIGIBLE_ROUTE') NOT NULL DEFAULT 'PENDING',
    `allocationMethod` ENUM('WEIGHTED_FAIR_SHARE', 'PRIORITY_FALLBACK') NULL,
    `distributionBasis` ENUM('APPLICATION_COUNT', 'ALLOCATED_AMOUNT') NULL,
    `selectedWeightPercent` DECIMAL(7, 4) NULL,
    `selectedPriority` INTEGER NULL,
    `capacityPeriod` ENUM('DAILY', 'MONTHLY') NULL,
    `capacityPeriodKey` VARCHAR(20) NULL,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `decisionReasonCode` VARCHAR(100) NULL,
    `decisionSnapshot` JSON NULL,
    `assignedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MlmAllocationDecision_applicationReference_key`(`applicationReference`),
    INDEX `MlmAllocationDecision_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `MlmAllocationDecision_lenderId_productId_idx`(`lenderId`, `productId`),
    INDEX `MlmAllocationDecision_policyVersionId_idx`(`policyVersionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmAllocationAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `decisionId` VARCHAR(191) NOT NULL,
    `policyVersionId` VARCHAR(191) NULL,
    `attemptNumber` INTEGER NOT NULL,
    `outcome` ENUM('ASSIGNED', 'NO_ELIGIBLE_ROUTE', 'REJECTED_BY_PLATFORM_POLICY', 'ERROR') NOT NULL,
    `requestedAmount` DECIMAL(12, 2) NOT NULL,
    `candidateResults` JSON NOT NULL,
    `selectedRouteId` VARCHAR(191) NULL,
    `reasonCode` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MlmAllocationAttempt_decisionId_createdAt_idx`(`decisionId`, `createdAt`),
    UNIQUE INDEX `MlmAllocationAttempt_decisionId_attemptNumber_key`(`decisionId`, `attemptNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MlmPolicy` ADD CONSTRAINT `MlmPolicy_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicy` ADD CONSTRAINT `MlmPolicy_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `MlmPolicy`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_rejectedById_fkey` FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_activatedById_fkey` FOREIGN KEY (`activatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationRoute` ADD CONSTRAINT `MlmAllocationRoute_mlmPolicyVersionId_fkey` FOREIGN KEY (`mlmPolicyVersionId`) REFERENCES `MlmPolicyVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationRoute` ADD CONSTRAINT `MlmAllocationRoute_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationRoute` ADD CONSTRAINT `MlmAllocationRoute_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `LenderProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmCapacityUsage` ADD CONSTRAINT `MlmCapacityUsage_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmCapacityUsage` ADD CONSTRAINT `MlmCapacityUsage_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `LenderProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `MlmPolicy`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_policyVersionId_fkey` FOREIGN KEY (`policyVersionId`) REFERENCES `MlmPolicyVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_routeId_fkey` FOREIGN KEY (`routeId`) REFERENCES `MlmAllocationRoute`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `LenderProduct`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationAttempt` ADD CONSTRAINT `MlmAllocationAttempt_decisionId_fkey` FOREIGN KEY (`decisionId`) REFERENCES `MlmAllocationDecision`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationAttempt` ADD CONSTRAINT `MlmAllocationAttempt_policyVersionId_fkey` FOREIGN KEY (`policyVersionId`) REFERENCES `MlmPolicyVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

