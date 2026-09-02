-- CreateTable
CREATE TABLE `application_face_matches` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` BIGINT UNSIGNED NOT NULL,
    `provider` VARCHAR(50) NOT NULL DEFAULT 'DIGITAP',
    `provider_request_id` VARCHAR(150) NULL,
    `client_ref_num` VARCHAR(64) NULL,
    `status` ENUM('MATCHED', 'NOT_MATCHED', 'SKIPPED', 'ERROR') NOT NULL,
    `is_same_face` BOOLEAN NULL,
    `same_face_confidence` DECIMAL(9, 8) NULL,
    `person_image_blurry` BOOLEAN NULL,
    `card_image_blurry` BOOLEAN NULL,
    `person_image_face_detected` BOOLEAN NULL,
    `card_image_face_detected` BOOLEAN NULL,
    `live_photo_document_id` BIGINT UNSIGNED NULL,
    `aadhaar_document_id` BIGINT UNSIGNED NULL,
    `raw_response` LONGTEXT NULL,
    `failure_reason` TEXT NULL,
    `matched_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `application_face_matches_applicationId_key`(`applicationId`),
    INDEX `idx_app_face_match_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `application_face_matches`
    ADD CONSTRAINT `application_face_matches_applicationId_fkey`
    FOREIGN KEY (`applicationId`) REFERENCES `pl_applications`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
