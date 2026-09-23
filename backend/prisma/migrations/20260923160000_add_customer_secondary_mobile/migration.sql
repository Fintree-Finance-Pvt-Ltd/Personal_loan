-- AlterTable
ALTER TABLE `customers`
  ADD COLUMN `secondary_mobile_number` VARCHAR(15) NULL,
  ADD COLUMN `secondary_mobile_verified` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `secondary_mobile_verified_at` DATETIME NULL;
