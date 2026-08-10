ALTER TABLE `pl_applications` ADD COLUMN `platform_product_id` VARCHAR(50) NULL;
ALTER TABLE `pl_applications` ADD COLUMN `scope_code` VARCHAR(60) NOT NULL DEFAULT 'PLATFORM_DEFAULT';
ALTER TABLE `pl_applications` ADD COLUMN `requested_amount` DECIMAL(15, 2) NULL;
ALTER TABLE `pl_applications` ADD COLUMN `requested_tenure` INT NULL;
