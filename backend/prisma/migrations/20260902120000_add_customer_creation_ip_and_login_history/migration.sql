-- AlterTable
ALTER TABLE `customers` ADD COLUMN `customer_creation_ip` VARCHAR(64) NULL;

-- CreateIndex
CREATE INDEX `idx_customers_creation_ip` ON `customers`(`customer_creation_ip`);

-- CreateTable
CREATE TABLE `customer_login_history` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `mobile_number` VARCHAR(15) NOT NULL,
    `ip_address` VARCHAR(64) NULL,
    `login_type` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_login_history_customer_id`(`customer_id`),
    INDEX `idx_login_history_ip_address`(`ip_address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customer_login_history`
    ADD CONSTRAINT `customer_login_history_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
