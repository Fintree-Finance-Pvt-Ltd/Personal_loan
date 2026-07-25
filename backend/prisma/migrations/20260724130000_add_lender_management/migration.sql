-- Add lender master management with maker-checker lifecycle and optimistic concurrency.
CREATE TABLE `Lender` (
  `id` VARCHAR(191) NOT NULL,
  `legalName` VARCHAR(255) NOT NULL,
  `displayName` VARCHAR(150) NOT NULL,
  `code` VARCHAR(30) NOT NULL,
  `supportEmail` VARCHAR(254) NULL,
  `supportPhone` VARCHAR(20) NULL,
  `approvalStatus` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  `operationalStatus` ENUM('INACTIVE', 'ACTIVE') NOT NULL DEFAULT 'INACTIVE',
  `integrationHealth` ENUM('NOT_CONFIGURED', 'HEALTHY', 'DEGRADED', 'DOWN') NOT NULL DEFAULT 'NOT_CONFIGURED',
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdById` VARCHAR(191) NOT NULL,
  `updatedById` VARCHAR(191) NOT NULL,
  `submittedById` VARCHAR(191) NULL,
  `approvedById` VARCHAR(191) NULL,
  `rejectedById` VARCHAR(191) NULL,
  `submittedAt` DATETIME(3) NULL,
  `approvedAt` DATETIME(3) NULL,
  `rejectedAt` DATETIME(3) NULL,
  `rejectionReason` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `Lender_code_key`(`code`),
  INDEX `Lender_approvalStatus_idx`(`approvalStatus`),
  INDEX `Lender_operationalStatus_idx`(`operationalStatus`),
  INDEX `Lender_integrationHealth_idx`(`integrationHealth`),
  INDEX `Lender_createdById_idx`(`createdById`),
  INDEX `Lender_updatedById_idx`(`updatedById`),
  INDEX `Lender_submittedById_idx`(`submittedById`),
  INDEX `Lender_approvedById_idx`(`approvedById`),
  INDEX `Lender_rejectedById_idx`(`rejectedById`),
  INDEX `Lender_approvalStatus_updatedAt_idx`(`approvalStatus`, `updatedAt`),
  INDEX `Lender_operationalStatus_updatedAt_idx`(`operationalStatus`, `updatedAt`),
  INDEX `Lender_createdAt_idx`(`createdAt`),
  INDEX `Lender_updatedAt_idx`(`updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Lender`
  ADD CONSTRAINT `Lender_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Lender`
  ADD CONSTRAINT `Lender_updatedById_fkey`
  FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Lender`
  ADD CONSTRAINT `Lender_submittedById_fkey`
  FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Lender`
  ADD CONSTRAINT `Lender_approvedById_fkey`
  FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Lender`
  ADD CONSTRAINT `Lender_rejectedById_fkey`
  FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
