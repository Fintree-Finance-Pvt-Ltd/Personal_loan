-- DropForeignKey
ALTER TABLE `LenderOfferTier` DROP FOREIGN KEY `LenderOfferTier_productVersionId_fkey`;

-- AlterTable
ALTER TABLE `LenderProductVersion` ADD COLUMN `annualRoiPercent` DECIMAL(7, 4) NOT NULL,
    ADD COLUMN `assessmentFeeAmount` DECIMAL(12, 2) NOT NULL,
    ADD COLUMN `assessmentFeeGstPercent` DECIMAL(5, 2) NOT NULL,
    ADD COLUMN `bounceChargeAmount` DECIMAL(12, 2) NOT NULL,
    ADD COLUMN `emiDueDay` INTEGER NOT NULL,
    ADD COLUMN `includeAssessmentFeeInApr` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `interestMethod` ENUM('REDUCING_BALANCE', 'FLAT_RATE') NOT NULL,
    ADD COLUMN `penalChargeAmount` DECIMAL(12, 2) NOT NULL,
    ADD COLUMN `processingFeeGstPercent` DECIMAL(5, 2) NOT NULL,
    ADD COLUMN `processingFeePercent` DECIMAL(7, 4) NOT NULL,
    MODIFY `repeatTierScope` ENUM('SAME_LENDER', 'PLATFORM_WIDE') NOT NULL DEFAULT 'SAME_LENDER';

-- DropTable
DROP TABLE `LenderOfferTier`;

-- CreateTable
CREATE TABLE `LenderOfferMultiplier` (
    `id` VARCHAR(191) NOT NULL,
    `productVersionId` VARCHAR(191) NOT NULL,
    `minimumCompletedLoans` INTEGER NOT NULL,
    `multiplier` DECIMAL(8, 4) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LenderOfferMultiplier_productVersionId_sortOrder_idx`(`productVersionId`, `sortOrder`),
    UNIQUE INDEX `LenderOfferMultiplier_productVersionId_minimumCompletedLoans_key`(`productVersionId`, `minimumCompletedLoans`),
    UNIQUE INDEX `LenderOfferMultiplier_productVersionId_sortOrder_key`(`productVersionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LenderProductTenure` (
    `id` VARCHAR(191) NOT NULL,
    `productVersionId` VARCHAR(191) NOT NULL,
    `tenureMonths` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LenderProductTenure_productVersionId_sortOrder_idx`(`productVersionId`, `sortOrder`),
    UNIQUE INDEX `LenderProductTenure_productVersionId_tenureMonths_key`(`productVersionId`, `tenureMonths`),
    UNIQUE INDEX `LenderProductTenure_productVersionId_sortOrder_key`(`productVersionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LenderOfferMultiplier` ADD CONSTRAINT `LenderOfferMultiplier_productVersionId_fkey` FOREIGN KEY (`productVersionId`) REFERENCES `LenderProductVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProductTenure` ADD CONSTRAINT `LenderProductTenure_productVersionId_fkey` FOREIGN KEY (`productVersionId`) REFERENCES `LenderProductVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

