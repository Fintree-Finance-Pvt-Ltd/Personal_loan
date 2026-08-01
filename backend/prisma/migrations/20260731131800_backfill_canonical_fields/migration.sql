-- Alter Table PlApplication to make platform_product_id and scope_code nullable
ALTER TABLE `pl_applications` MODIFY `platform_product_id` VARCHAR(50) NULL;
ALTER TABLE `pl_applications` MODIFY `scope_code` VARCHAR(60) NULL;
