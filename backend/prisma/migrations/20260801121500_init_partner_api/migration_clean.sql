ALTER TABLE `LenderApplicationLink` DROP FOREIGN KEY `fk_lender_link_application`;

ALTER TABLE `LenderApplicationLink` DROP FOREIGN KEY `fk_lender_link_config`;

ALTER TABLE `LenderApplicationLink` DROP FOREIGN KEY `fk_lender_link_lender`;

ALTER TABLE `LenderApplicationLink` DROP FOREIGN KEY `fk_lender_link_product`;

ALTER TABLE `LenderApplicationLink` DROP FOREIGN KEY `fk_lender_link_product_version`;

ALTER TABLE `LenderDataSharingConsent` DROP FOREIGN KEY `fk_lender_consent_application`;

ALTER TABLE `LenderDataSharingConsent` DROP FOREIGN KEY `fk_lender_consent_customer`;

ALTER TABLE `LenderDataSharingConsent` DROP FOREIGN KEY `fk_lender_consent_lender`;

ALTER TABLE `LenderIntegrationConfig` DROP FOREIGN KEY `fk_lender_integration_config_lender`;

ALTER TABLE `LenderIntegrationOutbox` DROP FOREIGN KEY `fk_lender_outbox_application`;

ALTER TABLE `LenderIntegrationOutbox` DROP FOREIGN KEY `fk_lender_outbox_lender`;

ALTER TABLE `application_addresses` DROP FOREIGN KEY `fk_application_address_application`;

ALTER TABLE `application_employment_snapshots` DROP FOREIGN KEY `fk_application_employment_application`;

ALTER TABLE `application_kyc_snapshots` DROP FOREIGN KEY `fk_application_kyc_application`;

ALTER TABLE `application_liveness` DROP FOREIGN KEY `fk_application_liveness_application`;

ALTER TABLE `application_liveness` DROP FOREIGN KEY `fk_application_liveness_document`;

ALTER TABLE `application_stage_consents` DROP FOREIGN KEY `fk_application_stage_consent_application`;

ALTER TABLE `application_stage_consents` DROP FOREIGN KEY `fk_application_stage_consent_lender`;

ALTER TABLE `pl_customer_documents` DROP FOREIGN KEY `fk_pl_customer_document_application`;

ALTER TABLE `pl_electronic_sign_transactions` DROP FOREIGN KEY `fk_pl_esign_loan`;

ALTER TABLE `pl_payment_links` DROP FOREIGN KEY `fk_pl_payment_application`;

-- AlterTable

-- AlterTable
ALTER TABLE `pl_electronic_sign_transactions` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `pl_payment_links` MODIFY `purpose` ENUM('PROCESSING_FEE', 'ASSESSMENT_FEE', 'OTHER') NOT NULL DEFAULT 'PROCESSING_FEE';

-- CreateTable
CREATE TABLE `partner_api_clients` (
    `id` VARCHAR(191) NOT NULL,
    `clientCode` VARCHAR(50) NOT NULL,
    `displayName` VARCHAR(100) NOT NULL,
    `clientId` VARCHAR(100) NOT NULL,
    `secretReference` VARCHAR(255) NOT NULL,
    `authenticationType` VARCHAR(50) NOT NULL DEFAULT 'HMAC_SHA256',
    `allowedIpAddresses` VARCHAR(1000) NULL,
    `webhookUrl` VARCHAR(500) NULL,
    `webhookSecretReference` VARCHAR(255) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL,

    UNIQUE INDEX `partner_api_clients_clientCode_key`(`clientCode`),
    UNIQUE INDEX `partner_api_clients_clientId_key`(`clientId`),
    INDEX `partner_api_clients_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_api_nonces` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `nonce` VARCHAR(100) NOT NULL,
    `expiresAt` DATETIME(0) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `partner_api_nonces_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `partner_api_nonces_clientId_nonce_key`(`clientId`, `nonce`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_api_idempotency_records` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(100) NOT NULL,
    `endpoint` VARCHAR(100) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `responseStatus` INTEGER NOT NULL,
    `responseBody` LONGTEXT NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `partner_api_idempotency_records_clientId_idempotencyKey_key`(`clientId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_applications` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `partnerApplicationId` VARCHAR(50) NOT NULL,
    `partnerApplicationNumber` VARCHAR(50) NOT NULL,
    `externalApplicationReference` VARCHAR(100) NOT NULL,
    `sourceSystem` VARCHAR(100) NOT NULL,
    `productCode` VARCHAR(50) NOT NULL,
    `status` ENUM('CREATED', 'CONSENT_RECORDED', 'PROFILE_COMPLETE', 'PRE_APPROVAL_PENDING', 'PRE_APPROVED', 'ONBOARDING_IN_PROGRESS', 'ONBOARDING_COMPLETE', 'FINAL_APPROVAL_PENDING', 'FINAL_APPROVED', 'REJECTED', 'MANDATE_AUTHORIZED', 'DISBURSEMENT_PENDING', 'DISBURSED', 'DISBURSEMENT_FAILED', 'CANCELLED') NOT NULL DEFAULT 'CREATED',
    `customerId` BIGINT UNSIGNED NOT NULL,
    `plApplicationId` BIGINT UNSIGNED NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL,

    UNIQUE INDEX `partner_applications_partnerApplicationId_key`(`partnerApplicationId`),
    UNIQUE INDEX `partner_applications_partnerApplicationNumber_key`(`partnerApplicationNumber`),
    INDEX `partner_applications_status_idx`(`status`),
    INDEX `partner_applications_plApplicationId_idx`(`plApplicationId`),
    UNIQUE INDEX `partner_applications_clientId_externalApplicationReference_key`(`clientId`, `externalApplicationReference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_application_consents` (
    `id` VARCHAR(191) NOT NULL,
    `partnerApplicationId` VARCHAR(191) NOT NULL,
    `consentReference` VARCHAR(100) NOT NULL,
    `consentType` VARCHAR(100) NOT NULL,
    `consentTemplateId` VARCHAR(100) NOT NULL,
    `consentVersion` VARCHAR(50) NOT NULL,
    `consentTextHash` CHAR(64) NOT NULL,
    `acceptedAt` DATETIME(0) NOT NULL,
    `ipAddress` VARCHAR(45) NOT NULL,
    `userAgentHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `partner_application_consents_consentReference_key`(`consentReference`),
    UNIQUE INDEX `partner_application_consents_partnerApplicationId_consentTyp_key`(`partnerApplicationId`, `consentType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_application_profile_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `partnerApplicationId` VARCHAR(191) NOT NULL,
    `profileData` LONGTEXT NOT NULL,
    `markedCompleteAt` DATETIME(0) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `partner_application_profile_snapshots_partnerApplicationId_key`(`partnerApplicationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_application_decisions` (
    `id` VARCHAR(191) NOT NULL,
    `partnerApplicationId` VARCHAR(191) NOT NULL,
    `decisionType` ENUM('PRE_APPROVAL', 'FINAL_APPROVAL') NOT NULL,
    `outcome` ENUM('APPROVED', 'REJECTED', 'PENDING') NOT NULL,
    `decisionReference` VARCHAR(150) NOT NULL,
    `decisionAt` DATETIME(0) NOT NULL,
    `reasonCode` VARCHAR(100) NULL,
    `coolingOffDays` INTEGER NULL,
    `nextStatusCheckAt` DATETIME(0) NULL,
    `offerData` LONGTEXT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `partner_application_decisions_partnerApplicationId_decisionT_key`(`partnerApplicationId`, `decisionType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_application_onboarding_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `partnerApplicationId` VARCHAR(191) NOT NULL,
    `onboardingData` LONGTEXT NOT NULL,
    `markedCompleteAt` DATETIME(0) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `partner_application_onboarding_snapshots_partnerApplicationI_key`(`partnerApplicationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_application_mandates` (
    `id` VARCHAR(191) NOT NULL,
    `partnerApplicationId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(100) NOT NULL,
    `mandateReference` VARCHAR(150) NOT NULL,
    `umrn` VARCHAR(50) NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `authorizedAt` DATETIME(0) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `partner_application_mandates_partnerApplicationId_key`(`partnerApplicationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_application_disbursements` (
    `id` VARCHAR(191) NOT NULL,
    `partnerApplicationId` VARCHAR(191) NOT NULL,
    `disbursementReference` VARCHAR(150) NOT NULL,
    `status` ENUM('PENDING', 'DISBURSED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `requestedAt` DATETIME(0) NOT NULL,
    `processedAt` DATETIME(0) NULL,
    `failureCode` VARCHAR(100) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL,

    UNIQUE INDEX `partner_application_disbursements_disbursementReference_key`(`disbursementReference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_webhook_outbox` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `partnerApplicationId` VARCHAR(191) NULL,
    `eventType` VARCHAR(100) NOT NULL,
    `payload` LONGTEXT NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'DEAD_LETTER') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(0) NULL,
    `lastFailureReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `partner_webhook_outbox_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `partner_webhook_outbox_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_api_audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `partnerApplicationId` VARCHAR(50) NULL,
    `endpoint` VARCHAR(200) NOT NULL,
    `method` VARCHAR(10) NOT NULL,
    `correlationId` VARCHAR(100) NULL,
    `idempotencyKey` VARCHAR(100) NULL,
    `requestHash` CHAR(64) NULL,
    `responseStatus` INTEGER NOT NULL,
    `durationMs` INTEGER NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `partner_api_audit_logs_clientId_createdAt_idx`(`clientId`, `createdAt`),
    INDEX `partner_api_audit_logs_correlationId_idx`(`correlationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pl_payment_links` ADD CONSTRAINT `pl_payment_links_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_customer_documents` ADD CONSTRAINT `pl_customer_documents_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_applications` ADD CONSTRAINT `pl_applications_platform_product_id_fkey` FOREIGN KEY (`platform_product_id`) REFERENCES `PlatformProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderIntegrationConfig` ADD CONSTRAINT `LenderIntegrationConfig_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderDataSharingConsent` ADD CONSTRAINT `LenderDataSharingConsent_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderDataSharingConsent` ADD CONSTRAINT `LenderDataSharingConsent_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderDataSharingConsent` ADD CONSTRAINT `LenderDataSharingConsent_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderApplicationLink` ADD CONSTRAINT `LenderApplicationLink_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderApplicationLink` ADD CONSTRAINT `LenderApplicationLink_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderApplicationLink` ADD CONSTRAINT `LenderApplicationLink_lenderProductId_fkey` FOREIGN KEY (`lenderProductId`) REFERENCES `LenderProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderApplicationLink` ADD CONSTRAINT `LenderApplicationLink_productStrategyVersionId_fkey` FOREIGN KEY (`productStrategyVersionId`) REFERENCES `LenderProductVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderApplicationLink` ADD CONSTRAINT `LenderApplicationLink_integrationConfigId_fkey` FOREIGN KEY (`integrationConfigId`) REFERENCES `LenderIntegrationConfig`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderIntegrationOutbox` ADD CONSTRAINT `LenderIntegrationOutbox_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderIntegrationOutbox` ADD CONSTRAINT `LenderIntegrationOutbox_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_employment_snapshots` ADD CONSTRAINT `application_employment_snapshots_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_kyc_snapshots` ADD CONSTRAINT `application_kyc_snapshots_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_addresses` ADD CONSTRAINT `application_addresses_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_liveness` ADD CONSTRAINT `application_liveness_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_liveness` ADD CONSTRAINT `application_liveness_photoDocumentId_fkey` FOREIGN KEY (`photoDocumentId`) REFERENCES `pl_customer_documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_stage_consents` ADD CONSTRAINT `application_stage_consents_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_stage_consents` ADD CONSTRAINT `application_stage_consents_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_electronic_sign_transactions` ADD CONSTRAINT `pl_electronic_sign_transactions_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `pl_loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_api_nonces` ADD CONSTRAINT `partner_api_nonces_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `partner_api_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_api_idempotency_records` ADD CONSTRAINT `partner_api_idempotency_records_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `partner_api_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_applications` ADD CONSTRAINT `partner_applications_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `partner_api_clients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_applications` ADD CONSTRAINT `partner_applications_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_applications` ADD CONSTRAINT `partner_applications_plApplicationId_fkey` FOREIGN KEY (`plApplicationId`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_application_consents` ADD CONSTRAINT `partner_application_consents_partnerApplicationId_fkey` FOREIGN KEY (`partnerApplicationId`) REFERENCES `partner_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_application_profile_snapshots` ADD CONSTRAINT `partner_application_profile_snapshots_partnerApplicationId_fkey` FOREIGN KEY (`partnerApplicationId`) REFERENCES `partner_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_application_decisions` ADD CONSTRAINT `partner_application_decisions_partnerApplicationId_fkey` FOREIGN KEY (`partnerApplicationId`) REFERENCES `partner_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_application_onboarding_snapshots` ADD CONSTRAINT `partner_application_onboarding_snapshots_partnerApplication_fkey` FOREIGN KEY (`partnerApplicationId`) REFERENCES `partner_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_application_mandates` ADD CONSTRAINT `partner_application_mandates_partnerApplicationId_fkey` FOREIGN KEY (`partnerApplicationId`) REFERENCES `partner_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_application_disbursements` ADD CONSTRAINT `partner_application_disbursements_partnerApplicationId_fkey` FOREIGN KEY (`partnerApplicationId`) REFERENCES `partner_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_webhook_outbox` ADD CONSTRAINT `partner_webhook_outbox_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `partner_api_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_webhook_outbox` ADD CONSTRAINT `partner_webhook_outbox_partnerApplicationId_fkey` FOREIGN KEY (`partnerApplicationId`) REFERENCES `partner_applications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_api_audit_logs` ADD CONSTRAINT `partner_api_audit_logs_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `partner_api_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RedefineIndex
CREATE INDEX `LenderApplicationLink_adapterKey_adapterVersion_idx` ON `LenderApplicationLink`(`adapterKey`, `adapterVersion`);

-- RedefineIndex
CREATE INDEX `LenderApplicationLink_lenderId_createStatus_idx` ON `LenderApplicationLink`(`lenderId`, `createStatus`);

-- RedefineIndex
CREATE INDEX `LenderApplicationLink_partnerApplicationId_idx` ON `LenderApplicationLink`(`partnerApplicationId`);

-- RedefineIndex
CREATE INDEX `LenderDataSharingConsent_customerId_acceptedAt_idx` ON `LenderDataSharingConsent`(`customerId`, `acceptedAt`);

-- RedefineIndex
CREATE INDEX `LenderDataSharingConsent_lenderId_acceptedAt_idx` ON `LenderDataSharingConsent`(`lenderId`, `acceptedAt`);

-- RedefineIndex
CREATE UNIQUE INDEX `LenderDataSharingConsent_applicationId_lenderId_consentVersi_key` ON `LenderDataSharingConsent`(`applicationId`, `lenderId`, `consentVersion`);

-- RedefineIndex
CREATE INDEX `LenderIntegrationConfig_adapterKey_adapterVersion_isActive_idx` ON `LenderIntegrationConfig`(`adapterKey`, `adapterVersion`, `isActive`);

-- RedefineIndex
CREATE INDEX `LenderIntegrationConfig_lenderId_isActive_idx` ON `LenderIntegrationConfig`(`lenderId`, `isActive`);

-- RedefineIndex
CREATE UNIQUE INDEX `LenderIntegrationConfig_lenderId_adapterKey_adapterVersion_key` ON `LenderIntegrationConfig`(`lenderId`, `adapterKey`, `adapterVersion`);

-- RedefineIndex
CREATE INDEX `LenderIntegrationOutbox_applicationId_integrationStage_idx` ON `LenderIntegrationOutbox`(`applicationId`, `integrationStage`);

-- RedefineIndex
CREATE INDEX `LenderIntegrationOutbox_lenderId_status_idx` ON `LenderIntegrationOutbox`(`lenderId`, `status`);

-- RedefineIndex
CREATE INDEX `LenderIntegrationOutbox_lockedAt_idx` ON `LenderIntegrationOutbox`(`lockedAt`);

-- RedefineIndex
CREATE INDEX `LenderIntegrationOutbox_status_availableAt_createdAt_idx` ON `LenderIntegrationOutbox`(`status`, `availableAt`, `createdAt`);

-- RedefineIndex
CREATE INDEX `application_stage_consents_applicationId_consentType_accepte_idx` ON `application_stage_consents`(`applicationId`, `consentType`, `acceptedAt`);

-- RedefineIndex
CREATE UNIQUE INDEX `application_stage_consents_applicationId_lenderId_consentTyp_key` ON `application_stage_consents`(`applicationId`, `lenderId`, `consentType`, `consentVersion`);

-- RedefineIndex
CREATE INDEX `customer_refresh_tokens_expires_at_idx` ON `customer_refresh_tokens`(`expires_at`);

-- RedefineIndex
CREATE INDEX `customer_refresh_tokens_parent_token_id_idx` ON `customer_refresh_tokens`(`parent_token_id`);

-- RedefineIndex
CREATE INDEX `customer_refresh_tokens_session_id_revoked_at_idx` ON `customer_refresh_tokens`(`session_id`, `revoked_at`);

-- RedefineIndex
CREATE INDEX `customer_sessions_absolute_expires_at_idx` ON `customer_sessions`(`absolute_expires_at`);

-- RedefineIndex
CREATE INDEX `customer_sessions_customer_id_revoked_at_idx` ON `customer_sessions`(`customer_id`, `revoked_at`);

-- RedefineIndex
CREATE INDEX `customer_sessions_idle_expires_at_idx` ON `customer_sessions`(`idle_expires_at`);

-- RedefineIndex
CREATE UNIQUE INDEX `pl_electronic_sign_transactions_otp_session_id_key` ON `pl_electronic_sign_transactions`(`otp_session_id`);

