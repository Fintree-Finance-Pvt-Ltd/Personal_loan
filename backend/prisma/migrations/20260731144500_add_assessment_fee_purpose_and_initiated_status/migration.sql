-- AlterTable - Add ASSESSMENT_FEE to PlPaymentPurpose
ALTER TABLE `pl_payment_links` MODIFY `purpose` ENUM('PROCESSING_FEE', 'ASSESSMENT_FEE', 'OTHER') NULL;

-- AlterTable - Add INITIATED to PlPaymentStatus
ALTER TABLE `pl_payment_links` MODIFY `status` ENUM('CREATED', 'INITIATED', 'SENT', 'SUCCESS', 'FAILED', 'PROCESSING') NOT NULL DEFAULT 'CREATED';
