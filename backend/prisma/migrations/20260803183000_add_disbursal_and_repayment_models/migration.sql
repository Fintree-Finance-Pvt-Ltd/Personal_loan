-- AlterTable pl_loans
ALTER TABLE `pl_loans`
  ADD COLUMN `disbursal_date` DATE NULL,
  ADD COLUMN `first_repayment_date` DATE NULL;

-- CreateTable disbursal_webhook_events
CREATE TABLE `disbursal_webhook_events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `provider` VARCHAR(50) NOT NULL,
    `event_id` VARCHAR(100) NULL,
    `lan` VARCHAR(30) NULL,
    `payload_hash` CHAR(64) NOT NULL,
    `sanitized_payload` JSON NULL,
    `processing_status` VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `safe_error_code` VARCHAR(100) NULL,
    `received_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `processed_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_disbursal_webhook_lan`(`lan`),
    INDEX `idx_disbursal_webhook_status`(`processing_status`),
    UNIQUE INDEX `uk_disbursal_webhook_provider_hash`(`provider`, `payload_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable pl_repayment_schedules
CREATE TABLE `pl_repayment_schedules` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `loan_id` BIGINT UNSIGNED NOT NULL,
    `lan` VARCHAR(30) NOT NULL,
    `installment_number` INTEGER NOT NULL,
    `due_date` DATE NOT NULL,
    `opening_principal` DECIMAL(15, 2) NOT NULL,
    `emi` DECIMAL(15, 2) NOT NULL,
    `interest` DECIMAL(15, 2) NOT NULL,
    `principal` DECIMAL(15, 2) NOT NULL,
    `closing_principal` DECIMAL(15, 2) NOT NULL,
    `outstanding_principal` DECIMAL(15, 2) NOT NULL,
    `payment_status` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    `dpd` INTEGER NOT NULL DEFAULT 0,
    `paid_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `payment_date` DATETIME(0) NULL,
    `remaining_amount` DECIMAL(15, 2) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_pl_rps_loan_id`(`loan_id`),
    INDEX `idx_pl_rps_lan`(`lan`),
    UNIQUE INDEX `uk_pl_rps_lan_installment`(`lan`, `installment_number`),
    PRIMARY KEY (`id`),
    CONSTRAINT `pl_repayment_schedules_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `pl_loans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable pl_repayments
CREATE TABLE `pl_repayments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `loan_id` BIGINT UNSIGNED NOT NULL,
    `lan` VARCHAR(30) NOT NULL,
    `payment_id` VARCHAR(100) NOT NULL,
    `amount_received` DECIMAL(15, 2) NOT NULL,
    `payment_date` DATETIME(0) NOT NULL,
    `payment_mode` VARCHAR(50) NOT NULL,
    `reference_number` VARCHAR(100) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
    `unallocated_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_pl_repayment_loan_id`(`loan_id`),
    INDEX `idx_pl_repayment_lan`(`lan`),
    UNIQUE INDEX `uk_pl_repayment_payment_id`(`payment_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `pl_repayments_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `pl_loans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable pl_repayment_allocations
CREATE TABLE `pl_repayment_allocations` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `repayment_id` BIGINT UNSIGNED NOT NULL,
    `loan_id` BIGINT UNSIGNED NOT NULL,
    `lan` VARCHAR(30) NOT NULL,
    `installment_number` INTEGER NOT NULL,
    `component` VARCHAR(50) NOT NULL,
    `allocated_amount` DECIMAL(15, 2) NOT NULL,
    `allocation_date` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    INDEX `idx_pl_allocation_repayment_id`(`repayment_id`),
    INDEX `idx_pl_allocation_loan_id`(`loan_id`),
    INDEX `idx_pl_allocation_lan`(`lan`),
    PRIMARY KEY (`id`),
    CONSTRAINT `pl_repayment_allocations_repayment_id_fkey` FOREIGN KEY (`repayment_id`) REFERENCES `pl_repayments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `pl_repayment_allocations_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `pl_loans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
