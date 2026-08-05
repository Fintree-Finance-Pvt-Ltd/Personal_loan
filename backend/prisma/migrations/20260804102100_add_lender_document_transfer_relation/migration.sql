-- AlterTable
ALTER TABLE `lender_integration_outbox` ADD COLUMN `documentTransferId` BIGINT UNSIGNED NULL;

-- AddForeignKey
ALTER TABLE `lender_integration_outbox` ADD CONSTRAINT `lender_integration_outbox_documentTransferId_fkey` FOREIGN KEY (`documentTransferId`) REFERENCES `lender_document_transfers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
