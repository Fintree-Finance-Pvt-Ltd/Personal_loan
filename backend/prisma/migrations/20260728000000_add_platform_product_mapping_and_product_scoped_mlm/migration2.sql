-- AlterTable
ALTER TABLE `LenderProduct` ALTER COLUMN `platformProductId` DROP DEFAULT;

-- AlterTable
ALTER TABLE `MlmPolicy` ALTER COLUMN `platformProductId` DROP DEFAULT;

-- AddForeignKey
ALTER TABLE `MlmAllocationRoute` ADD CONSTRAINT `MlmAllocationRoute_mlmPolicyVersionId_fkey` FOREIGN KEY (`mlmPolicyVersionId`) REFERENCES `MlmPolicyVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformProduct` ADD CONSTRAINT `PlatformProduct_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformProduct` ADD CONSTRAINT `PlatformProduct_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

