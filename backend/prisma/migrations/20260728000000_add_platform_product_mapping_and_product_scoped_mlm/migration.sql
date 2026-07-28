-- CreateTable
CREATE TABLE `PlatformProduct` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `description` VARCHAR(500) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlatformProduct_code_key`(`code`),
    INDEX `PlatformProduct_status_name_idx`(`status`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Insert default PlatformProduct for migration backfill
INSERT INTO `PlatformProduct` (`id`, `name`, `code`, `description`, `status`, `createdById`, `updatedById`, `createdAt`, `updatedAt`)
VALUES ('PLAT_PROD_001', 'Personal Loan Standard', 'PERSONAL_LOAN_STANDARD', 'Standard Personal Loan Product for Platform', 'ACTIVE', 'SYSTEM', 'SYSTEM', NOW(), NOW());



-- Insert default PlatformProduct for migration backfill
INSERT INTO `PlatformProduct` (`id`, `name`, `code`, `description`, `status`, `createdById`, `updatedById`, `createdAt`, `updatedAt`)
VALUES ('PLAT_PROD_001', 'Personal Loan Standard', 'PERSONAL_LOAN_STANDARD', 'Standard Personal Loan Product for Platform', 'ACTIVE', 'SYSTEM', 'SYSTEM', NOW(), NOW());

-- DropForeignKey
ALTER TABLE `MlmAllocationRoute` DROP FOREIGN KEY `MlmAllocationRoute_mlmPolicyVersionId_fkey`;

-- DropForeignKey
ALTER TABLE `MlmAllocationRouteState` DROP FOREIGN KEY `MlmAllocationRouteState_mlmPolicyVersionId_fkey`;

-- DropForeignKey
ALTER TABLE `MlmAllocationRouteState` DROP FOREIGN KEY `MlmAllocationRouteState_routeId_fkey`;

-- DropIndex
DROP INDEX `MlmAllocationRoute_mlmPolicyVersionId_lenderId_key` ON `MlmAllocationRoute`;

-- DropIndex
DROP INDEX `MlmAllocationRoute_mlmPolicyVersionId_productId_key` ON `MlmAllocationRoute`;

-- AlterTable
ALTER TABLE `LenderProduct` ADD COLUMN `platformProductId` VARCHAR(191) NOT NULL DEFAULT 'PLAT_PROD_001';

-- AlterTable
ALTER TABLE `MlmAllocationAttempt` MODIFY `outcome` ENUM('ASSIGNED', 'NO_ELIGIBLE_ROUTE', 'REJECTED_BY_PLATFORM_POLICY', 'ERROR') NOT NULL;

-- AlterTable
ALTER TABLE `MlmAllocationDecision` ADD COLUMN `allocationMethod` ENUM('WEIGHTED_FAIR_SHARE', 'PRIORITY_FALLBACK') NULL,
    ADD COLUMN `capacityPeriod` ENUM('DAILY', 'MONTHLY') NULL,
    ADD COLUMN `capacityPeriodKey` VARCHAR(20) NULL,
    ADD COLUMN `customerSegment` ENUM('ALL', 'NEW', 'REPEAT') NOT NULL,
    ADD COLUMN `distributionBasis` ENUM('APPLICATION_COUNT', 'ALLOCATED_AMOUNT') NULL,
    ADD COLUMN `platformDecisionOutcome` ENUM('PASS', 'FAIL', 'REFER') NOT NULL,
    ADD COLUMN `platformProductId` VARCHAR(191) NULL,
    ADD COLUMN `selectedPriority` INTEGER NULL,
    ADD COLUMN `selectedWeightPercent` DECIMAL(7, 4) NULL,
    MODIFY `platformEvaluationReference` VARCHAR(191) NULL,
    MODIFY `status` ENUM('PENDING', 'ASSIGNED', 'NO_ELIGIBLE_ROUTE') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `MlmAllocationRoute` DROP COLUMN `allocationPercentage`,
    ADD COLUMN `allocationWeightPercent` DECIMAL(7, 4) NULL,
    ADD COLUMN `capacityPeriod` ENUM('DAILY', 'MONTHLY') NOT NULL,
    ADD COLUMN `customerSegment` ENUM('ALL', 'NEW', 'REPEAT') NOT NULL DEFAULT 'ALL',
    ADD COLUMN `maximumAllocatedAmount` DECIMAL(16, 2) NULL,
    ADD COLUMN `maximumApplicationCount` INTEGER NULL,
    ADD COLUMN `maximumTicketAmount` DECIMAL(12, 2) NULL,
    ADD COLUMN `minimumTicketAmount` DECIMAL(12, 2) NULL,
    ADD COLUMN `priority` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `MlmPolicy` ADD COLUMN `platformProductId` VARCHAR(191) NOT NULL DEFAULT 'PLAT_PROD_001';

-- AlterTable
ALTER TABLE `MlmPolicyVersion` ADD COLUMN `distributionBasis` ENUM('APPLICATION_COUNT', 'ALLOCATED_AMOUNT') NULL,
    MODIFY `allocationMethod` ENUM('WEIGHTED_FAIR_SHARE', 'PRIORITY_FALLBACK') NOT NULL;

-- AlterTable
ALTER TABLE `customers` DROP COLUMN `face_liveness_provider_app_id`,
    DROP COLUMN `face_liveness_score`,
    DROP COLUMN `face_liveness_status`;

-- DropTable
DROP TABLE `MlmAllocationRouteState`;

-- CreateTable
CREATE TABLE `pl_payment_links` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `application_number` VARCHAR(50) NULL,
    `customer_name` VARCHAR(160) NULL,
    `mobile` VARCHAR(20) NULL,
    `email` VARCHAR(160) NULL,
    `purpose` ENUM('PROCESSING_FEE', 'OTHER') NOT NULL DEFAULT 'PROCESSING_FEE',
    `amount` DECIMAL(15, 2) NOT NULL,
    `txnid` VARCHAR(120) NOT NULL,
    `easebuzz_id` VARCHAR(150) NULL,
    `payment_link` TEXT NULL,
    `status` ENUM('CREATED', 'SENT', 'SUCCESS', 'FAILED', 'PROCESSING') NOT NULL DEFAULT 'CREATED',
    `sms_status` ENUM('NOT_SENT', 'SENT', 'FAILED') NOT NULL DEFAULT 'NOT_SENT',
    `raw_request` LONGTEXT NULL,
    `raw_create_response` LONGTEXT NULL,
    `raw_webhook_response` LONGTEXT NULL,
    `paid_at` DATETIME(6) NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `updated_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL,

    UNIQUE INDEX `pl_payment_links_txnid_key`(`txnid`),
    INDEX `idx_pl_payment_links_customer_id`(`customer_id`),
    INDEX `idx_pl_payment_links_status`(`status`),
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


-- CreateIndex
CREATE INDEX `LenderProduct_platformProductId_operationalStatus_idx` ON `LenderProduct`(`platformProductId`, `operationalStatus`);

-- CreateIndex
CREATE INDEX `LenderProduct_lenderId_operationalStatus_idx` ON `LenderProduct`(`lenderId`, `operationalStatus`);

-- CreateIndex
CREATE UNIQUE INDEX `LenderProduct_lenderId_platformProductId_key` ON `LenderProduct`(`lenderId`, `platformProductId`);

-- CreateIndex
CREATE INDEX `MlmAllocationRoute_customerSegment_idx` ON `MlmAllocationRoute`(`customerSegment`);

-- CreateIndex
CREATE UNIQUE INDEX `MlmAllocationRoute_mlmPolicyVersionId_lenderId_productId_cus_key` ON `MlmAllocationRoute`(`mlmPolicyVersionId`, `lenderId`, `productId`, `customerSegment`);

-- CreateIndex
CREATE INDEX `MlmPolicy_platformProductId_operationalStatus_idx` ON `MlmPolicy`(`platformProductId`, `operationalStatus`);

-- CreateIndex
CREATE INDEX `MlmPolicy_scopeCode_platformProductId_operationalStatus_idx` ON `MlmPolicy`(`scopeCode`, `platformProductId`, `operationalStatus`);

-- AddForeignKey
ALTER TABLE `LenderProduct` ADD CONSTRAINT `LenderProduct_platformProductId_fkey` FOREIGN KEY (`platformProductId`) REFERENCES `PlatformProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProductVersion` ADD CONSTRAINT `LenderProductVersion_rejectedById_fkey` FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_payment_links` ADD CONSTRAINT `pl_payment_links_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicy` ADD CONSTRAINT `MlmPolicy_platformProductId_fkey` FOREIGN KEY (`platformProductId`) REFERENCES `PlatformProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmCapacityUsage` ADD CONSTRAINT `MlmCapacityUsage_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmCapacityUsage` ADD CONSTRAINT `MlmCapacityUsage_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `LenderProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `MlmPolicy`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_platformProductId_fkey` FOREIGN KEY (`platformProductId`) REFERENCES `PlatformProduct`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformProduct` ADD CONSTRAINT `PlatformProduct_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformProduct` ADD CONSTRAINT `PlatformProduct_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

