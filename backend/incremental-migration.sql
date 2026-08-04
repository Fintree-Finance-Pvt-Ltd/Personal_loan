-- AlterTable
ALTER TABLE `LenderApplicationLink` 
ADD COLUMN `consentStatus` ENUM('NOT_STARTED', 'IN_PROGRESS', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN `consentIdempotencyKey` VARCHAR(191) NULL,
ADD COLUMN `consentPayloadVersion` INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX `LenderApplicationLink_consentIdempotencyKey_key` ON `LenderApplicationLink`(`consentIdempotencyKey`);

-- AlterTable
ALTER TABLE `application_kyc_snapshots` 
ADD COLUMN `maskedAadhaar` CHAR(14) NULL,
ADD COLUMN `verifiedDateOfBirth` VARCHAR(10) NULL,
ADD COLUMN `verifiedGender` VARCHAR(10) NULL;

-- AlterTable
ALTER TABLE `LenderIntegrationOutbox` 
MODIFY COLUMN `documentTransferId` BIGINT UNSIGNED NULL;

-- AlterTable
ALTER TABLE `LenderDocumentTransfer` 
ADD COLUMN `last_error_message` TEXT NULL;

-- AddForeignKey
ALTER TABLE `LenderDocumentTransfer` ADD CONSTRAINT `LenderDocumentTransfer_source_document_id_fkey` FOREIGN KEY (`source_document_id`) REFERENCES `pl_customer_documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
