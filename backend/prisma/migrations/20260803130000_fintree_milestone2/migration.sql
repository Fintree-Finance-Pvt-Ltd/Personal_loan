-- AlterTable
ALTER TABLE `LenderApplicationLink` MODIFY `lastSyncedStage` ENUM('CREATE', 'UPDATE', 'DECISION', 'STATUS', 'CONSENT', 'DOCUMENT') NULL;

-- AlterTable
ALTER TABLE `LenderIntegrationConfig` ADD COLUMN `documentUploadPath` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `LenderIntegrationOutbox` ADD COLUMN `documentTransferId` VARCHAR(50) NULL,
    MODIFY `eventType` ENUM('LENDER_CREATE_APPLICATION', 'LENDER_UPDATE_APPLICATION', 'LENDER_REQUEST_DECISION', 'LENDER_STATUS_CHECK', 'LENDER_SUBMIT_CONSENT', 'LENDER_UPLOAD_DOCUMENT') NOT NULL,
    MODIFY `integrationStage` ENUM('CREATE', 'UPDATE', 'DECISION', 'STATUS', 'CONSENT', 'DOCUMENT') NOT NULL;

-- AlterTable
ALTER TABLE `pl_applications` ADD COLUMN `platform_lan` VARCHAR(50) NULL;

-- CreateTable
CREATE TABLE `lender_document_transfers` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `application_id` BIGINT UNSIGNED NOT NULL,
    `lender_application_link_id` VARCHAR(191) NOT NULL,
    `source_document_id` BIGINT UNSIGNED NOT NULL,
    `document_type` VARCHAR(50) NOT NULL,
    `source_file_sha256` CHAR(64) NULL,
    `source_file_size` INTEGER NULL,
    `source_mime_type` VARCHAR(100) NULL,
    `partner_document_id` VARCHAR(100) NULL,
    `transfer_status` ENUM('PENDING', 'PROCESSING', 'ACKNOWLEDGED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `provider_status` VARCHAR(50) NULL,
    `idempotency_key` VARCHAR(100) NOT NULL,
    `acknowledged_at` DATETIME(0) NULL,
    `last_error_code` VARCHAR(100) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `lender_document_transfers_idempotency_key_key`(`idempotency_key`),
    INDEX `lender_document_transfers_application_id_idx`(`application_id`),
    INDEX `lender_document_transfers_transfer_status_idx`(`transfer_status`),
    UNIQUE INDEX `lender_document_transfers_lender_application_link_id_source__key`(`lender_application_link_id`, `source_document_id`, `document_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `pl_applications_platform_lan_key` ON `pl_applications`(`platform_lan`);

-- AddForeignKey
ALTER TABLE `lender_document_transfers` ADD CONSTRAINT `lender_document_transfers_lender_application_link_id_fkey` FOREIGN KEY (`lender_application_link_id`) REFERENCES `LenderApplicationLink`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
