-- AlterTable
ALTER TABLE `platform_policies` ADD COLUMN `platformProductId` VARCHAR(191) NOT NULL DEFAULT 'PL_DEFAULT',
    ADD COLUMN `scopeCode` VARCHAR(60) NOT NULL DEFAULT 'PLATFORM_DEFAULT';

-- CreateIndex
CREATE INDEX `platform_policies_platformProductId_operationalStatus_idx` ON `platform_policies`(`platformProductId`, `operationalStatus`);

-- CreateIndex
CREATE INDEX `platform_policies_scopeCode_platformProductId_operationalStatus_idx` ON `platform_policies`(`scopeCode`, `platformProductId`, `operationalStatus`);
