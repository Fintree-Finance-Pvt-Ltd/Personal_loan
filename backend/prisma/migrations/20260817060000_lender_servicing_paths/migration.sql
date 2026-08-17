ALTER TABLE `LenderIntegrationConfig` ADD COLUMN `repaymentPath` VARCHAR(255) NULL;
ALTER TABLE `LenderIntegrationConfig` ADD COLUMN `chargePath` VARCHAR(255) NULL;
ALTER TABLE `LenderIntegrationConfig` ADD COLUMN `chargeWaiverPath` VARCHAR(255) NULL;
