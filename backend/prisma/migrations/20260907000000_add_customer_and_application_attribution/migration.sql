-- CreateTable
CREATE TABLE `customer_attributions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `first_source` ENUM('RM', 'GOOGLE', 'META', 'MARKETING', 'PARTNER', 'ORGANIC', 'REFERRAL', 'WEBSITE', 'OTHER') NOT NULL DEFAULT 'WEBSITE',
    `first_utm_source` VARCHAR(100) NULL,
    `first_utm_medium` VARCHAR(100) NULL,
    `first_utm_campaign` VARCHAR(150) NULL,
    `first_utm_term` VARCHAR(150) NULL,
    `first_utm_content` VARCHAR(150) NULL,
    `first_rm_id` VARCHAR(100) NULL,
    `first_rm_name` VARCHAR(150) NULL,
    `first_partner_code` VARCHAR(100) NULL,
    `first_partner_name` VARCHAR(150) NULL,
    `first_referral_code` VARCHAR(100) NULL,
    `first_click_id` VARCHAR(255) NULL,
    `first_landing_page` VARCHAR(500) NULL,
    `first_referrer` VARCHAR(500) NULL,
    `first_touch_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_source` ENUM('RM', 'GOOGLE', 'META', 'MARKETING', 'PARTNER', 'ORGANIC', 'REFERRAL', 'WEBSITE', 'OTHER') NULL,
    `last_utm_source` VARCHAR(100) NULL,
    `last_utm_medium` VARCHAR(100) NULL,
    `last_utm_campaign` VARCHAR(150) NULL,
    `last_utm_term` VARCHAR(150) NULL,
    `last_utm_content` VARCHAR(150) NULL,
    `last_rm_id` VARCHAR(100) NULL,
    `last_rm_name` VARCHAR(150) NULL,
    `last_partner_code` VARCHAR(100) NULL,
    `last_partner_name` VARCHAR(150) NULL,
    `last_referral_code` VARCHAR(100) NULL,
    `last_click_id` VARCHAR(255) NULL,
    `last_landing_page` VARCHAR(500) NULL,
    `last_referrer` VARCHAR(500) NULL,
    `last_touch_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `customer_attributions_customer_id_key`(`customer_id`),
    INDEX `idx_customer_attr_first_source`(`first_source`),
    INDEX `idx_customer_attr_first_rm_id`(`first_rm_id`),
    INDEX `idx_customer_attr_first_partner_code`(`first_partner_code`),
    INDEX `idx_customer_attr_first_referral_code`(`first_referral_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `application_attributions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `application_id` BIGINT UNSIGNED NOT NULL,
    `acquisition_source` ENUM('RM', 'GOOGLE', 'META', 'MARKETING', 'PARTNER', 'ORGANIC', 'REFERRAL', 'WEBSITE', 'OTHER') NOT NULL DEFAULT 'WEBSITE',
    `utm_source` VARCHAR(100) NULL,
    `utm_medium` VARCHAR(100) NULL,
    `utm_campaign` VARCHAR(150) NULL,
    `utm_term` VARCHAR(150) NULL,
    `utm_content` VARCHAR(150) NULL,
    `rm_id` VARCHAR(100) NULL,
    `rm_name` VARCHAR(150) NULL,
    `partner_code` VARCHAR(100) NULL,
    `partner_name` VARCHAR(150) NULL,
    `referral_code` VARCHAR(100) NULL,
    `click_id` VARCHAR(255) NULL,
    `landing_page` VARCHAR(500) NULL,
    `referrer` VARCHAR(500) NULL,
    `captured_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `application_attributions_application_id_key`(`application_id`),
    INDEX `idx_app_attr_source`(`acquisition_source`),
    INDEX `idx_app_attr_rm_id`(`rm_id`),
    INDEX `idx_app_attr_partner_code`(`partner_code`),
    INDEX `idx_app_attr_referral_code`(`referral_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customer_attributions`
    ADD CONSTRAINT `customer_attributions_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_attributions`
    ADD CONSTRAINT `application_attributions_application_id_fkey`
    FOREIGN KEY (`application_id`) REFERENCES `pl_applications`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
