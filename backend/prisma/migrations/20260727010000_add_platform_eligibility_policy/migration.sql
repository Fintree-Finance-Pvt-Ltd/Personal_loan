-- AlterTable
ALTER TABLE `customers` DROP COLUMN `residential_city`,
    DROP COLUMN `residential_state`;

-- DropTable
DROP TABLE `pl_payment_links`;

-- CreateTable
CREATE TABLE `PlatformPolicy` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `description` VARCHAR(500) NULL,
    `operationalStatus` ENUM('INACTIVE', 'ACTIVE') NOT NULL DEFAULT 'INACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlatformPolicy_code_key`(`code`),
    INDEX `PlatformPolicy_operationalStatus_updatedAt_idx`(`operationalStatus`, `updatedAt`),
    INDEX `PlatformPolicy_createdById_idx`(`createdById`),
    INDEX `PlatformPolicy_updatedById_idx`(`updatedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformPolicyVersion` (
    `id` VARCHAR(191) NOT NULL,
    `policyId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
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

    INDEX `PlatformPolicyVersion_policyId_status_idx`(`policyId`, `status`),
    INDEX `PlatformPolicyVersion_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `PlatformPolicyVersion_submittedById_idx`(`submittedById`),
    INDEX `PlatformPolicyVersion_approvedById_idx`(`approvedById`),
    UNIQUE INDEX `PlatformPolicyVersion_policyId_versionNumber_key`(`policyId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformPolicyRule` (
    `id` VARCHAR(191) NOT NULL,
    `policyVersionId` VARCHAR(191) NOT NULL,
    `ruleCode` VARCHAR(80) NOT NULL,
    `ruleName` VARCHAR(150) NOT NULL,
    `category` ENUM('IDENTITY', 'DEMOGRAPHIC', 'GEOGRAPHY', 'INCOME', 'EMPLOYMENT', 'EXPOSURE', 'PERFORMANCE', 'FRAUD', 'COOLDOWN') NOT NULL,
    `inputKey` VARCHAR(100) NOT NULL,
    `valueType` ENUM('BOOLEAN', 'INTEGER', 'DECIMAL', 'STRING', 'STRING_ARRAY') NOT NULL,
    `operator` ENUM('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'IN', 'NOT_IN', 'IS_TRUE', 'IS_FALSE') NOT NULL,
    `expectedValue` JSON NULL,
    `failureOutcome` ENUM('PASS', 'FAIL', 'REFER') NOT NULL,
    `reasonCode` VARCHAR(100) NOT NULL,
    `customerMessage` VARCHAR(300) NOT NULL,
    `internalMessage` VARCHAR(500) NULL,
    `priority` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PlatformPolicyRule_policyVersionId_priority_idx`(`policyVersionId`, `priority`),
    INDEX `PlatformPolicyRule_ruleCode_idx`(`ruleCode`),
    UNIQUE INDEX `PlatformPolicyRule_policyVersionId_ruleCode_key`(`policyVersionId`, `ruleCode`),
    UNIQUE INDEX `PlatformPolicyRule_policyVersionId_sortOrder_key`(`policyVersionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PlatformPolicy` ADD CONSTRAINT `PlatformPolicy_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicy` ADD CONSTRAINT `PlatformPolicy_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `PlatformPolicy`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_rejectedById_fkey` FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_activatedById_fkey` FOREIGN KEY (`activatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyRule` ADD CONSTRAINT `PlatformPolicyRule_policyVersionId_fkey` FOREIGN KEY (`policyVersionId`) REFERENCES `PlatformPolicyVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

