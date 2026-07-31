CREATE TABLE `customer_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `absolute_expires_at` DATETIME(3) NOT NULL,
    `idle_expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_reason` VARCHAR(120) NULL,
    `ip_address` VARCHAR(64) NULL,
    `user_agent` VARCHAR(512) NULL,
    `device_label` VARCHAR(160) NULL,
    `request_id` VARCHAR(64) NOT NULL,

    INDEX `idx_customer_sessions_customer_id_revoked_at`(`customer_id`, `revoked_at`),
    INDEX `idx_customer_sessions_absolute_expires_at`(`absolute_expires_at`),
    INDEX `idx_customer_sessions_idle_expires_at`(`idle_expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `session_id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `parent_token_id` VARCHAR(191) NULL,
    `issued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,

    UNIQUE INDEX `customer_refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `idx_customer_refresh_tokens_session_id_revoked_at`(`session_id`, `revoked_at`),
    INDEX `idx_customer_refresh_tokens_parent_token_id`(`parent_token_id`),
    INDEX `idx_customer_refresh_tokens_expires_at`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_sessions` ADD CONSTRAINT `customer_sessions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_refresh_tokens` ADD CONSTRAINT `customer_refresh_tokens_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `customer_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_refresh_tokens` ADD CONSTRAINT `customer_refresh_tokens_parent_token_id_fkey` FOREIGN KEY (`parent_token_id`) REFERENCES `customer_refresh_tokens`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
