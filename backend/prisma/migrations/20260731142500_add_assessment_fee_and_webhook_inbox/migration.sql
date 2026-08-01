-- AlterTable
ALTER TABLE `pl_applications` ADD COLUMN `platform_decision_at` DATETIME(0) NULL;

-- AlterTable
ALTER TABLE `pl_applications` MODIFY `status` ENUM('DRAFT', 'SUBMITTED', 'PLATFORM_REJECTED', 'ALLOCATION_PENDING', 'LENDER_ALLOCATED', 'LENDER_REVIEW', 'LENDER_APPROVED', 'LENDER_REJECTED', 'ASSESSMENT_FEE_PAID') NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE `pl_webhook_inbox` (
    `id` VARCHAR(191) NOT NULL,
    `provider_transaction_id` VARCHAR(255) NOT NULL,
    `provider` VARCHAR(50) NOT NULL,
    `event_hash` VARCHAR(512) NOT NULL,
    `payload` JSON NOT NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `idx_pl_webhook_inbox_unique_tx`(`provider`, `provider_transaction_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
