-- CreateTable
CREATE TABLE `MlmAllocationRouteState` (
    `id` VARCHAR(191) NOT NULL,
    `mlmPolicyVersionId` VARCHAR(191) NOT NULL,
    `routeId` VARCHAR(191) NOT NULL,
    `currentWeight` DECIMAL(12, 4) NOT NULL DEFAULT 0,
    `allocatedApplicationCount` INTEGER NOT NULL DEFAULT 0,
    `allocatedAmount` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MlmAllocationRouteState_routeId_key`(`routeId`),
    INDEX `MlmAllocationRouteState_mlmPolicyVersionId_idx`(`mlmPolicyVersionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MlmAllocationRouteState` ADD CONSTRAINT `MlmAllocationRouteState_mlmPolicyVersionId_fkey` FOREIGN KEY (`mlmPolicyVersionId`) REFERENCES `MlmPolicyVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationRouteState` ADD CONSTRAINT `MlmAllocationRouteState_routeId_fkey` FOREIGN KEY (`routeId`) REFERENCES `MlmAllocationRoute`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

