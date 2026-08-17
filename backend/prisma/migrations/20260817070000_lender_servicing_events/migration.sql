-- AlterTable
ALTER TABLE `LenderApplicationLink` MODIFY `lastSyncedStage` ENUM('CREATE', 'UPDATE', 'DECISION', 'STATUS', 'CONSENT', 'DOCUMENT', 'DISBURSE', 'REPAYMENT', 'CHARGE', 'CHARGE_WAIVER') NULL;

-- AlterTable
ALTER TABLE `LenderIntegrationOutbox` ADD COLUMN `chargeId` BIGINT UNSIGNED NULL,
    ADD COLUMN `chargeWaiverId` BIGINT UNSIGNED NULL,
    ADD COLUMN `repaymentId` BIGINT UNSIGNED NULL,
    MODIFY `eventType` ENUM('LENDER_CREATE_APPLICATION', 'LENDER_UPDATE_APPLICATION', 'LENDER_REQUEST_DECISION', 'LENDER_STATUS_CHECK', 'LENDER_SUBMIT_CONSENT', 'LENDER_UPLOAD_DOCUMENT', 'LENDER_REQUEST_DISBURSAL', 'LENDER_NOTIFY_REPAYMENT', 'LENDER_NOTIFY_CHARGE', 'LENDER_NOTIFY_CHARGE_WAIVER') NOT NULL,
    MODIFY `integrationStage` ENUM('CREATE', 'UPDATE', 'DECISION', 'STATUS', 'CONSENT', 'DOCUMENT', 'DISBURSE', 'REPAYMENT', 'CHARGE', 'CHARGE_WAIVER') NOT NULL;

-- CreateTable
CREATE TABLE `pl_loan_charge_waivers` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `charge_id` BIGINT UNSIGNED NOT NULL,
    `loan_id` BIGINT UNSIGNED NOT NULL,
    `lan` VARCHAR(30) NOT NULL,
    `waiver_amount` DECIMAL(15, 2) NOT NULL,
    `waived_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `waived_by_user_id` VARCHAR(191) NULL,
    `remarks` VARCHAR(255) NULL,
    `lender_notified_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `idx_pl_charge_waiver_charge_id`(`charge_id`),
    INDEX `idx_pl_charge_waiver_loan_id`(`loan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LenderIntegrationOutbox` ADD CONSTRAINT `LenderIntegrationOutbox_repaymentId_fkey` FOREIGN KEY (`repaymentId`) REFERENCES `pl_repayments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderIntegrationOutbox` ADD CONSTRAINT `LenderIntegrationOutbox_chargeId_fkey` FOREIGN KEY (`chargeId`) REFERENCES `pl_loan_charges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderIntegrationOutbox` ADD CONSTRAINT `LenderIntegrationOutbox_chargeWaiverId_fkey` FOREIGN KEY (`chargeWaiverId`) REFERENCES `pl_loan_charge_waivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_loan_charge_waivers` ADD CONSTRAINT `pl_loan_charge_waivers_charge_id_fkey` FOREIGN KEY (`charge_id`) REFERENCES `pl_loan_charges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

