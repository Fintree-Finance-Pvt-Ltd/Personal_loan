ALTER TABLE `LenderApplicationLink`
  ADD COLUMN `rejectionReasonCode` VARCHAR(100) NULL;

ALTER TABLE `LenderDataSharingConsent`
  ADD COLUMN `consentTemplateId` VARCHAR(100) NULL,
  ADD COLUMN `consentText` TEXT NULL,
  ADD COLUMN `revokedAt` DATETIME(3) NULL;

UPDATE `LenderDataSharingConsent`
SET `consentTemplateId` = 'LEGACY_UNVERIFIED',
    `consentText` = COALESCE(`consentReference`, 'Legacy consent evidence; re-consent is required');

ALTER TABLE `LenderDataSharingConsent`
  MODIFY `consentTemplateId` VARCHAR(100) NOT NULL,
  MODIFY `consentText` TEXT NOT NULL;

ALTER TABLE `LenderIntegrationOutbox`
  ADD COLUMN `lockToken` CHAR(36) NULL,
  ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL,
  ADD INDEX `LenderIntegrationOutbox_leaseExpiresAt_idx` (`leaseExpiresAt`);

ALTER TABLE `pl_payment_links`
  ADD COLUMN `application_id` BIGINT UNSIGNED NULL,
  ADD INDEX `idx_pl_payment_links_application_id` (`application_id`),
  ADD CONSTRAINT `fk_pl_payment_application` FOREIGN KEY (`application_id`) REFERENCES `pl_applications` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE `pl_payment_links` p
JOIN `pl_applications` a ON a.`application_number` = p.`application_number`
SET p.`application_id` = a.`id`
WHERE p.`application_id` IS NULL;

ALTER TABLE `pl_customer_documents`
  ADD CONSTRAINT `fk_pl_customer_document_application` FOREIGN KEY (`application_id`) REFERENCES `pl_applications` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `application_employment_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `applicationId` BIGINT UNSIGNED NOT NULL,
  `employmentType` ENUM('SALARIED', 'SELF_EMPLOYED') NOT NULL,
  `companyType` ENUM('PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'PARTNERSHIP', 'GOVERNMENT', 'OTHER') NULL,
  `companyName` VARCHAR(200) NULL,
  `designation` VARCHAR(150) NULL,
  `businessName` VARCHAR(200) NULL,
  `businessConstitution` ENUM('PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'OTHER') NULL,
  `monthlyIncome` DECIMAL(15,2) NOT NULL,
  `annualTurnover` DECIMAL(15,2) NULL,
  `employmentVintage` VARCHAR(50) NULL,
  `businessVintage` VARCHAR(50) NULL,
  `salaryMode` VARCHAR(50) NULL,
  `completedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `application_employment_snapshots_applicationId_key` (`applicationId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_application_employment_application` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `application_kyc_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `applicationId` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `providerReference` VARCHAR(255) NOT NULL,
  `verificationStatus` ENUM('PENDING', 'VERIFIED', 'FAILED') NOT NULL,
  `verifiedName` VARCHAR(200) NULL,
  `verifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `application_kyc_snapshots_applicationId_key` (`applicationId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_application_kyc_application` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `application_addresses` (
  `id` VARCHAR(191) NOT NULL,
  `applicationId` BIGINT UNSIGNED NOT NULL,
  `addressType` ENUM('PERMANENT', 'CURRENT') NOT NULL,
  `source` ENUM('DIGILOCKER', 'CUSTOMER') NOT NULL,
  `addressLine1` VARCHAR(500) NOT NULL,
  `addressLine2` VARCHAR(500) NULL,
  `landmark` VARCHAR(200) NULL,
  `locality` VARCHAR(200) NULL,
  `district` VARCHAR(100) NULL,
  `city` VARCHAR(100) NOT NULL,
  `state` VARCHAR(100) NOT NULL,
  `country` VARCHAR(50) NOT NULL DEFAULT 'India',
  `pincode` VARCHAR(6) NOT NULL,
  `sameAsPermanent` BOOLEAN NULL,
  `sourceVerifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `application_addresses_applicationId_addressType_key` (`applicationId`, `addressType`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_application_address_application` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `application_liveness` (
  `id` VARCHAR(191) NOT NULL,
  `applicationId` BIGINT UNSIGNED NOT NULL,
  `photoDocumentId` BIGINT UNSIGNED NULL,
  `provider` VARCHAR(50) NOT NULL,
  `providerTransactionId` VARCHAR(150) NOT NULL,
  `verificationStatus` ENUM('PENDING', 'VERIFIED', 'FAILED') NOT NULL,
  `score` DECIMAL(5,4) NULL,
  `verifiedAt` DATETIME(3) NULL,
  `evidenceReference` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `application_liveness_applicationId_key` (`applicationId`),
  UNIQUE INDEX `application_liveness_photoDocumentId_key` (`photoDocumentId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_application_liveness_application` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_application_liveness_document` FOREIGN KEY (`photoDocumentId`) REFERENCES `pl_customer_documents` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `application_stage_consents` (
  `id` VARCHAR(191) NOT NULL,
  `applicationId` BIGINT UNSIGNED NOT NULL,
  `lenderId` VARCHAR(191) NOT NULL,
  `consentType` ENUM('DATA_SHARING', 'BUREAU_ENQUIRY', 'LENDER_CREDIT_ASSESSMENT', 'LENDER_DECISION_REQUEST') NOT NULL,
  `consentTemplateId` VARCHAR(100) NOT NULL,
  `consentVersion` VARCHAR(50) NOT NULL,
  `consentText` TEXT NOT NULL,
  `consentTextHash` CHAR(64) NOT NULL,
  `acceptedAt` DATETIME(3) NOT NULL,
  `ipAddress` VARCHAR(64) NULL,
  `userAgent` VARCHAR(512) NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_application_stage_consent_type` (`applicationId`, `consentType`, `acceptedAt`),
  UNIQUE INDEX `uk_application_stage_consent_version` (`applicationId`, `lenderId`, `consentType`, `consentVersion`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_application_stage_consent_application` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_application_stage_consent_lender` FOREIGN KEY (`lenderId`) REFERENCES `Lender` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `pl_loans`
  ADD UNIQUE INDEX `uk_pl_loans_application_id` (`application_id`);
