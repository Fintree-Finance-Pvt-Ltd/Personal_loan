-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'LOCKED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `passwordChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `authVersion` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_status_idx`(`status`),
    INDEX `User_lockedUntil_idx`(`lockedUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(80) NOT NULL,
    `description` VARCHAR(255) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_code_key`(`code`),
    INDEX `Role_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `module` VARCHAR(80) NOT NULL,
    `description` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Permission_code_key`(`code`),
    INDEX `Permission_module_idx`(`module`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRole` (
    `userId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `assignedBy` VARCHAR(191) NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserRole_roleId_idx`(`roleId`),
    INDEX `UserRole_assignedBy_idx`(`assignedBy`),
    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `roleId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RolePermission_permissionId_idx`(`permissionId`),
    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `absoluteExpiresAt` DATETIME(3) NOT NULL,
    `idleExpiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedReason` VARCHAR(120) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `deviceLabel` VARCHAR(160) NULL,
    `requestId` VARCHAR(64) NOT NULL,

    INDEX `Session_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `Session_absoluteExpiresAt_idx`(`absoluteExpiresAt`),
    INDEX `Session_idleExpiresAt_idx`(`idleExpiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `parentTokenId` VARCHAR(191) NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`),
    INDEX `RefreshToken_sessionId_revokedAt_idx`(`sessionId`, `revokedAt`),
    INDEX `RefreshToken_parentTokenId_idx`(`parentTokenId`),
    INDEX `RefreshToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoginAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `emailFingerprint` CHAR(64) NOT NULL,
    `maskedEmail` VARCHAR(254) NOT NULL,
    `outcome` ENUM('SUCCESS', 'FAILURE', 'LOCKED', 'DISABLED', 'RATE_LIMITED') NOT NULL,
    `reasonCode` VARCHAR(80) NOT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `requestId` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LoginAttempt_emailFingerprint_createdAt_idx`(`emailFingerprint`, `createdAt`),
    INDEX `LoginAttempt_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `LoginAttempt_ipAddress_createdAt_idx`(`ipAddress`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecurityEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NULL,
    `eventType` VARCHAR(80) NOT NULL,
    `severity` ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    `requestId` VARCHAR(64) NOT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SecurityEvent_eventType_createdAt_idx`(`eventType`, `createdAt`),
    INDEX `SecurityEvent_severity_createdAt_idx`(`severity`, `createdAt`),
    INDEX `SecurityEvent_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `SecurityEvent_sessionId_createdAt_idx`(`sessionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `actorRoleCodes` JSON NOT NULL,
    `permissionCode` VARCHAR(100) NULL,
    `module` VARCHAR(80) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `entityType` VARCHAR(80) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `outcome` ENUM('SUCCESS', 'FAILURE', 'DENIED') NOT NULL,
    `reason` VARCHAR(255) NULL,
    `previousValue` JSON NULL,
    `newValue` JSON NULL,
    `requestId` VARCHAR(64) NOT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `integrityHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    INDEX `AuditLog_module_action_createdAt_idx`(`module`, `action`, `createdAt`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

-- CreateTable
CREATE TABLE `LenderProduct` (
    `id` VARCHAR(191) NOT NULL,
    `lenderId` VARCHAR(191) NOT NULL,
    `platformProductId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `description` VARCHAR(255) NULL,
    `operationalStatus` ENUM('INACTIVE', 'ACTIVE') NOT NULL DEFAULT 'INACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LenderProduct_platformProductId_operationalStatus_idx`(`platformProductId`, `operationalStatus`),
    INDEX `LenderProduct_lenderId_operationalStatus_idx`(`lenderId`, `operationalStatus`),
    UNIQUE INDEX `LenderProduct_lenderId_code_key`(`lenderId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LenderProductVersion` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUPERSEDED') NOT NULL,
    `minimumAmount` DECIMAL(12, 2) NOT NULL,
    `firstLoanBaseAmount` DECIMAL(12, 2) NOT NULL,
    `maximumAmountCap` DECIMAL(12, 2) NOT NULL,
    `repeatTierScope` ENUM('SAME_LENDER', 'PLATFORM_WIDE') NOT NULL DEFAULT 'SAME_LENDER',
    `roundingMethod` ENUM('NONE', 'FLOOR', 'NEAREST', 'CEIL') NOT NULL,
    `roundingUnit` DECIMAL(12, 2) NULL,
    `interestMethod` ENUM('REDUCING_BALANCE', 'FLAT_RATE') NOT NULL,
    `annualRoiPercent` DECIMAL(7, 4) NOT NULL,
    `processingFeePercent` DECIMAL(7, 4) NOT NULL,
    `processingFeeGstPercent` DECIMAL(5, 2) NOT NULL,
    `assessmentFeeAmount` DECIMAL(12, 2) NOT NULL,
    `assessmentFeeGstPercent` DECIMAL(5, 2) NOT NULL,
    `penalChargeAmount` DECIMAL(12, 2) NOT NULL,
    `bounceChargeAmount` DECIMAL(12, 2) NOT NULL,
    `emiDueDay` INTEGER NOT NULL,
    `includeAssessmentFeeInApr` BOOLEAN NOT NULL DEFAULT false,
    `tenureType` ENUM('MONTHS', 'DAYS') NOT NULL DEFAULT 'MONTHS',
    `effectiveFrom` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `submittedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `rejectedById` VARCHAR(191) NULL,
    `activatedById` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `activatedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LenderProductVersion_productId_status_idx`(`productId`, `status`),
    INDEX `LenderProductVersion_status_updatedAt_idx`(`status`, `updatedAt`),
    UNIQUE INDEX `LenderProductVersion_productId_versionNumber_key`(`productId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LenderOfferMultiplier` (
    `id` VARCHAR(191) NOT NULL,
    `productVersionId` VARCHAR(191) NOT NULL,
    `minimumCompletedLoans` INTEGER NOT NULL,
    `multiplier` DECIMAL(8, 4) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LenderOfferMultiplier_productVersionId_sortOrder_idx`(`productVersionId`, `sortOrder`),
    UNIQUE INDEX `LenderOfferMultiplier_productVersionId_minimumCompletedLoans_key`(`productVersionId`, `minimumCompletedLoans`),
    UNIQUE INDEX `LenderOfferMultiplier_productVersionId_sortOrder_key`(`productVersionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LenderProductTenure` (
    `id` VARCHAR(191) NOT NULL,
    `productVersionId` VARCHAR(191) NOT NULL,
    `tenure` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LenderProductTenure_productVersionId_sortOrder_idx`(`productVersionId`, `sortOrder`),
    UNIQUE INDEX `LenderProductTenure_productVersionId_tenure_key`(`productVersionId`, `tenure`),
    UNIQUE INDEX `LenderProductTenure_productVersionId_sortOrder_key`(`productVersionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `otp_sessions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT UNSIGNED NULL,
    `mobile_number` VARCHAR(15) NULL,
    `email_id` VARCHAR(255) NULL,
    `purpose` ENUM('MOBILE_VERIFICATION', 'EMAIL_VERIFICATION', 'LOGIN', 'PASSWORD_RESET', 'PAYMENT_VERIFICATION') NOT NULL DEFAULT 'MOBILE_VERIFICATION',
    `channel` ENUM('SMS', 'EMAIL') NOT NULL,
    `otp_hash` VARCHAR(255) NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `verified_at` DATETIME(0) NULL,
    `attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `max_attempts` INTEGER UNSIGNED NOT NULL DEFAULT 5,
    `expires_at` DATETIME(0) NOT NULL,
    `last_sent_at` DATETIME(0) NOT NULL,
    `resend_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `consent_given` BOOLEAN NOT NULL DEFAULT false,
    `consent_text` TEXT NULL,
    `consent_at` DATETIME(0) NULL,
    `invalidated_at` DATETIME(0) NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `idx_otp_sessions_customer_id`(`customer_id`),
    INDEX `idx_otp_sessions_mobile_number`(`mobile_number`),
    INDEX `idx_otp_sessions_email_id`(`email_id`),
    INDEX `idx_otp_sessions_verified`(`verified`),
    INDEX `idx_otp_sessions_expires_at`(`expires_at`),
    INDEX `idx_otp_sessions_purpose`(`purpose`),
    INDEX `idx_otp_sessions_created_at`(`created_at`),
    INDEX `idx_otp_mobile_purpose_created`(`mobile_number`, `purpose`, `created_at`),
    INDEX `idx_otp_email_purpose_created`(`email_id`, `purpose`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_code` VARCHAR(30) NOT NULL,
    `country_code` VARCHAR(5) NOT NULL DEFAULT '+91',
    `mobile_number` VARCHAR(15) NOT NULL,
    `mobile_verified` BOOLEAN NOT NULL DEFAULT false,
    `mobile_verified_at` DATETIME(0) NULL,
    `full_name` VARCHAR(150) NULL,
    `first_name` VARCHAR(60) NULL,
    `middle_name` VARCHAR(60) NULL,
    `last_name` VARCHAR(60) NULL,
    `father_name` VARCHAR(150) NULL,
    `pan_number` VARCHAR(10) NULL,
    `pan_verified` BOOLEAN NOT NULL DEFAULT false,
    `pan_verified_at` DATETIME(0) NULL,
    `pan_provider_application_id` VARCHAR(100) NULL,
    `pan_holder_type` VARCHAR(100) NULL,
    `date_of_birth` DATE NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') NULL,
    `email` VARCHAR(255) NULL,
    `email_verified` BOOLEAN NOT NULL DEFAULT false,
    `email_verified_at` DATETIME(0) NULL,
    `residential_pincode` VARCHAR(6) NULL,
    `residential_city` VARCHAR(100) NULL,
    `residential_state` VARCHAR(100) NULL,
    `work_pincode` VARCHAR(6) NULL,
    `residence_status` ENUM('RENTED', 'OWNED', 'FAMILY_OWNED', 'COMPANY_PROVIDED') NULL,
    `employment_type` ENUM('SALARIED', 'SELF_EMPLOYED') NULL,
    `company_type` ENUM('PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'PARTNERSHIP', 'GOVERNMENT', 'OTHER') NULL,
    `company_name` VARCHAR(200) NULL,
    `designation` VARCHAR(150) NULL,
    `business_name` VARCHAR(200) NULL,
    `business_constitution` ENUM('PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'OTHER') NULL,
    `monthly_income` DECIMAL(15, 2) NULL,
    `annual_turnover` DECIMAL(15, 2) NULL,
    `employment_vintage` VARCHAR(50) NULL,
    `total_experience` VARCHAR(50) NULL,
    `salary_mode` VARCHAR(50) NULL,
    `business_vintage` VARCHAR(50) NULL,
    `kfs_language` VARCHAR(50) NULL DEFAULT 'English',
    `profile_completed_at` DATETIME(0) NULL,
    `account_status` ENUM('ACTIVE', 'BLOCKED', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `onboarding_status` ENUM('MOBILE_VERIFIED', 'BASIC_DETAILS_PENDING', 'PAN_VERIFIED', 'EMAIL_VERIFIED', 'PLATFORM_BRE_PENDING', 'PLATFORM_ELIGIBLE', 'PLATFORM_INELIGIBLE', 'APPLICATION_IN_PROGRESS', 'APPLICATION_SUBMITTED', 'LENDER_APPROVED', 'LENDER_REJECTED', 'DISBURSED') NOT NULL DEFAULT 'MOBILE_VERIFIED',
    `eligibility_status` ENUM('NOT_CHECKED', 'ELIGIBLE', 'INELIGIBLE') NOT NULL DEFAULT 'NOT_CHECKED',
    `eligibility_reason` VARCHAR(500) NULL,
    `eligibility_checked_at` DATETIME(0) NULL,
    `latest_application_id` BIGINT UNSIGNED NULL,
    `aadhaar_verified` BOOLEAN NOT NULL DEFAULT false,
    `aadhaar_kyc_status` VARCHAR(30) NULL,
    `masked_aadhaar` VARCHAR(20) NULL,
    `aadhaar_last_four_digits` VARCHAR(4) NULL,
    `aadhaar_verified_at` DATETIME(0) NULL,
    `digilocker_status` VARCHAR(30) NULL,
    `digilocker_session_id` VARCHAR(255) NULL,
    `digilocker_reference` VARCHAR(255) NULL,
    `digilocker_verified_at` DATETIME(0) NULL,
    `digilocker_consent_at` DATETIME(0) NULL,
    `digilocker_raw_response` LONGTEXT NULL,
    `last_login_at` DATETIME(0) NULL,
    `last_activity_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `customers_customer_code_key`(`customer_code`),
    UNIQUE INDEX `customers_mobile_number_key`(`mobile_number`),
    UNIQUE INDEX `customers_pan_number_key`(`pan_number`),
    INDEX `idx_customers_email`(`email`),
    INDEX `idx_customers_account_status`(`account_status`),
    INDEX `idx_customers_onboarding_status`(`onboarding_status`),
    INDEX `idx_customers_eligibility_status`(`eligibility_status`),
    INDEX `idx_customers_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `absolute_expires_at` DATETIME(3) NOT NULL,
    `idle_expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_reason` VARCHAR(120) NULL,
    `ip_address` VARCHAR(64) NULL,
    `user_agent` VARCHAR(512) NULL,
    `device_label` VARCHAR(160) NULL,
    `request_id` VARCHAR(64) NOT NULL,

    INDEX `customer_sessions_customer_id_revoked_at_idx`(`customer_id`, `revoked_at`),
    INDEX `customer_sessions_absolute_expires_at_idx`(`absolute_expires_at`),
    INDEX `customer_sessions_idle_expires_at_idx`(`idle_expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `session_id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `parent_token_id` VARCHAR(191) NULL,
    `issued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,

    UNIQUE INDEX `customer_refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `customer_refresh_tokens_session_id_revoked_at_idx`(`session_id`, `revoked_at`),
    INDEX `customer_refresh_tokens_parent_token_id_idx`(`parent_token_id`),
    INDEX `customer_refresh_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kyc_verification_status` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customerId` BIGINT UNSIGNED NOT NULL,
    `panStatus` ENUM('PENDING', 'INITIATED', 'VERIFIED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `gstStatus` ENUM('PENDING', 'INITIATED', 'VERIFIED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `aadhaarStatus` ENUM('PENDING', 'INITIATED', 'VERIFIED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `bureauStatus` ENUM('PENDING', 'INITIATED', 'VERIFIED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `mobileStatus` ENUM('PENDING', 'INITIATED', 'VERIFIED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `emailStatus` ENUM('PENDING', 'INITIATED', 'VERIFIED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `mobileApiRequest` LONGTEXT NULL,
    `mobileApiResponse` LONGTEXT NULL,
    `emailApiRequest` LONGTEXT NULL,
    `emailApiResponse` LONGTEXT NULL,
    `aadhaarTransactionId` VARCHAR(255) NULL,
    `aadhaarName` VARCHAR(255) NULL,
    `aadhaarMaskedNumber` VARCHAR(255) NULL,
    `aadhaarDob` DATE NULL,
    `aadhaarAddress` TEXT NULL,
    `firstName` VARCHAR(255) NULL,
    `middleName` VARCHAR(255) NULL,
    `lastName` VARCHAR(255) NULL,
    `bureauApiRequest` LONGTEXT NULL,
    `bureauApiResponse` LONGTEXT NULL,
    `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `is_pdf_generated` BOOLEAN NOT NULL DEFAULT false,
    `panApiRequest` LONGTEXT NULL,
    `panApiResponse` LONGTEXT NULL,
    `gstApiRequest` LONGTEXT NULL,
    `gstApiResponse` LONGTEXT NULL,
    `aadhaarApiRequest` LONGTEXT NULL,
    `aadhaarApiResponse` LONGTEXT NULL,
    `aadhaarWebhookResponse` LONGTEXT NULL,
    `aadhaarUniqueId` VARCHAR(255) NULL,

    UNIQUE INDEX `uk_kyc_verification_status_customer_id`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformPolicy` (
    `id` VARCHAR(191) NOT NULL,
    `platformProductId` VARCHAR(191) NOT NULL DEFAULT 'PL_DEFAULT',
    `name` VARCHAR(150) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `description` VARCHAR(500) NULL,
    `scopeCode` VARCHAR(60) NOT NULL DEFAULT 'PLATFORM_DEFAULT',
    `operationalStatus` ENUM('INACTIVE', 'ACTIVE') NOT NULL DEFAULT 'INACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlatformPolicy_code_key`(`code`),
    INDEX `PlatformPolicy_operationalStatus_updatedAt_idx`(`operationalStatus`, `updatedAt`),
    INDEX `PlatformPolicy_platformProductId_operationalStatus_idx`(`platformProductId`, `operationalStatus`),
    INDEX `PlatformPolicy_scopeCode_platformProductId_operationalStatus_idx`(`scopeCode`, `platformProductId`, `operationalStatus`),
    INDEX `PlatformPolicy_createdById_idx`(`createdById`),
    INDEX `PlatformPolicy_updatedById_idx`(`updatedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformPolicyVersion` (
    `id` VARCHAR(191) NOT NULL,
    `policyId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
    `effectiveFrom` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `submittedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `rejectedById` VARCHAR(191) NULL,
    `activatedById` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `activatedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PlatformPolicyVersion_policyId_status_idx`(`policyId`, `status`),
    INDEX `PlatformPolicyVersion_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `PlatformPolicyVersion_submittedById_idx`(`submittedById`),
    INDEX `PlatformPolicyVersion_approvedById_idx`(`approvedById`),
    UNIQUE INDEX `PlatformPolicyVersion_policyId_versionNumber_key`(`policyId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformPolicyRule` (
    `id` VARCHAR(191) NOT NULL,
    `policyVersionId` VARCHAR(191) NOT NULL,
    `ruleCode` VARCHAR(80) NOT NULL,
    `ruleName` VARCHAR(150) NOT NULL,
    `category` ENUM('IDENTITY', 'DEMOGRAPHIC', 'GEOGRAPHY', 'INCOME', 'EMPLOYMENT', 'EXPOSURE', 'PERFORMANCE', 'FRAUD', 'COOLDOWN') NOT NULL,
    `inputKey` VARCHAR(100) NOT NULL,
    `valueType` ENUM('BOOLEAN', 'INTEGER', 'DECIMAL', 'STRING', 'STRING_ARRAY') NOT NULL,
    `operator` ENUM('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'IN', 'NOT_IN', 'IS_TRUE', 'IS_FALSE') NOT NULL,
    `expectedValue` JSON NULL,
    `failureOutcome` ENUM('PASS', 'FAIL', 'REFER') NOT NULL,
    `reasonCode` VARCHAR(100) NOT NULL,
    `customerMessage` VARCHAR(300) NOT NULL,
    `internalMessage` VARCHAR(500) NULL,
    `priority` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PlatformPolicyRule_policyVersionId_priority_idx`(`policyVersionId`, `priority`),
    INDEX `PlatformPolicyRule_ruleCode_idx`(`ruleCode`),
    UNIQUE INDEX `PlatformPolicyRule_policyVersionId_ruleCode_key`(`policyVersionId`, `ruleCode`),
    UNIQUE INDEX `PlatformPolicyRule_policyVersionId_sortOrder_key`(`policyVersionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pl_payment_links` (
    `application_id` BIGINT UNSIGNED NULL,
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `application_number` VARCHAR(50) NULL,
    `customer_name` VARCHAR(160) NULL,
    `mobile` VARCHAR(20) NULL,
    `email` VARCHAR(160) NULL,
    `purpose` ENUM('PROCESSING_FEE', 'ASSESSMENT_FEE', 'OTHER') NOT NULL DEFAULT 'PROCESSING_FEE',
    `amount` DECIMAL(15, 2) NOT NULL,
    `txnid` VARCHAR(120) NOT NULL,
    `easebuzz_id` VARCHAR(150) NULL,
    `payment_link` TEXT NULL,
    `status` ENUM('CREATED', 'INITIATED', 'SENT', 'SUCCESS', 'FAILED', 'PROCESSING') NOT NULL DEFAULT 'CREATED',
    `sms_status` ENUM('NOT_SENT', 'SENT', 'FAILED') NOT NULL DEFAULT 'NOT_SENT',
    `raw_request` LONGTEXT NULL,
    `raw_create_response` LONGTEXT NULL,
    `raw_webhook_response` LONGTEXT NULL,
    `paid_at` DATETIME(6) NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `updated_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL,

    UNIQUE INDEX `pl_payment_links_txnid_key`(`txnid`),
    INDEX `idx_pl_payment_links_customer_id`(`customer_id`),
    INDEX `idx_pl_payment_links_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pl_customer_documents` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `application_id` BIGINT UNSIGNED NULL,
    `document_type` ENUM('CUSTOMER_LIVE_PHOTO', 'PAN_CARD', 'AADHAAR_CARD', 'BANK_STATEMENT', 'PAYSLIP', 'OTHER') NOT NULL DEFAULT 'CUSTOMER_LIVE_PHOTO',
    `applicant_type` VARCHAR(50) NOT NULL DEFAULT 'BORROWER',
    `status` ENUM('VERIFIED', 'PENDING', 'REJECTED', 'REPLACED', 'INACTIVE') NOT NULL DEFAULT 'VERIFIED',
    `file_name` VARCHAR(255) NOT NULL,
    `original_file_name` VARCHAR(255) NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `file_url` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
    `file_size` INTEGER NOT NULL,
    `source` VARCHAR(50) NOT NULL DEFAULT 'PROFILE_DETAILS',
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `accuracy` DECIMAL(8, 2) NULL,
    `formatted_address` TEXT NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(100) NULL,
    `country` VARCHAR(100) NULL,
    `postal_code` VARCHAR(20) NULL,
    `captured_at` DATETIME(6) NULL,
    `uploaded_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `face_liveness_status` VARCHAR(50) NULL,
    `face_liveness_score` DECIMAL(5, 4) NULL,
    `face_liveness_provider_app_id` VARCHAR(100) NULL,
    `metadata_json` LONGTEXT NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `updated_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL,

    INDEX `idx_pl_customer_docs_customer_id`(`customer_id`),
    INDEX `idx_pl_customer_docs_type`(`document_type`),
    INDEX `idx_pl_customer_docs_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pl_webhook_inbox` (
    `id` VARCHAR(191) NOT NULL,
    `provider_transaction_id` VARCHAR(255) NOT NULL,
    `provider` VARCHAR(50) NOT NULL,
    `event_hash` VARCHAR(512) NOT NULL,
    `payload` JSON NOT NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `idx_pl_webhook_inbox_unique_tx`(`provider`, `provider_transaction_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pl_applications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `application_number` VARCHAR(50) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'PLATFORM_REJECTED', 'ALLOCATION_PENDING', 'LENDER_ALLOCATED', 'LENDER_REVIEW', 'LENDER_APPROVED', 'LENDER_REJECTED', 'ASSESSMENT_FEE_PAID') NOT NULL DEFAULT 'DRAFT',
    `platform_product_id` VARCHAR(50) NULL,
    `scope_code` VARCHAR(60) NULL,
    `requested_amount` DECIMAL(15, 2) NULL,
    `requested_tenure` INTEGER NULL,
    `lender_code` VARCHAR(30) NULL,
    `submitted_at` DATETIME(0) NULL,
    `platform_decision_at` DATETIME(0) NULL,
    `lender_decision_at` DATETIME(0) NULL,
    `lender_decision_reason` VARCHAR(500) NULL,
    `approved_amount` DECIMAL(15, 2) NULL,
    `lender_approved_amount` DECIMAL(15, 2) NULL,
    `lender_approved_tenure` INTEGER NULL,
    `lender_approved_roi` DECIMAL(7, 4) NULL,
    `lender_decision_reference` VARCHAR(150) NULL,
    `lender_cooling_off_days` INTEGER NULL,
    `lender_cooling_off_until` DATETIME(0) NULL,
    `lender_next_status_check_at` DATETIME(0) NULL,
    `platform_decision_outcome` VARCHAR(30) NULL,
    `platform_evaluation_reference` VARCHAR(100) NULL,
    `platform_policy_version_id` VARCHAR(50) NULL,
    `mlm_allocation_decision_id` VARCHAR(50) NULL,
    `mlm_policy_id` VARCHAR(50) NULL,
    `mlm_policy_version_id` VARCHAR(50) NULL,
    `lender_id` VARCHAR(50) NULL,
    `lender_product_id` VARCHAR(50) NULL,
    `product_strategy_version_id` VARCHAR(50) NULL,
    `allocated_at` DATETIME(0) NULL,
    `assessment_fee_base_amount` DECIMAL(15, 2) NULL,
    `assessment_fee_gst_rate` DECIMAL(5, 2) NULL,
    `assessment_fee_gst_amount` DECIMAL(15, 2) NULL,
    `assessment_fee_total_amount` DECIMAL(15, 2) NULL,
    `assessment_fee_currency` VARCHAR(10) NULL DEFAULT 'INR',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `pl_applications_application_number_key`(`application_number`),
    INDEX `idx_pl_applications_customer_id`(`customer_id`),
    INDEX `idx_pl_applications_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LenderIntegrationConfig` (
    `id` VARCHAR(191) NOT NULL,
    `lenderId` VARCHAR(191) NOT NULL,
    `adapterKey` VARCHAR(80) NOT NULL,
    `adapterVersion` VARCHAR(30) NOT NULL,
    `baseUrl` VARCHAR(500) NULL,
    `authType` ENUM('NONE', 'API_KEY', 'BEARER_TOKEN', 'BASIC', 'CUSTOM') NOT NULL DEFAULT 'NONE',
    `credentialSecretReference` VARCHAR(150) NULL,
    `createApplicationPath` VARCHAR(255) NULL,
    `updateApplicationPath` VARCHAR(255) NULL,
    `decisionPath` VARCHAR(255) NULL,
    `statusPath` VARCHAR(255) NULL,
    `webhookPath` VARCHAR(255) NULL,
    `webhookSecretReference` VARCHAR(150) NULL,
    `connectTimeoutMs` INTEGER NOT NULL DEFAULT 5000,
    `requestTimeoutMs` INTEGER NOT NULL DEFAULT 15000,
    `maximumRetryAttempts` INTEGER NOT NULL DEFAULT 5,
    `retryScheduleSeconds` VARCHAR(100) NOT NULL DEFAULT '0,60,300,900,3600',
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LenderIntegrationConfig_lenderId_isActive_idx`(`lenderId`, `isActive`),
    INDEX `LenderIntegrationConfig_adapterKey_adapterVersion_isActive_idx`(`adapterKey`, `adapterVersion`, `isActive`),
    UNIQUE INDEX `LenderIntegrationConfig_lenderId_adapterKey_adapterVersion_key`(`lenderId`, `adapterKey`, `adapterVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LenderDataSharingConsent` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` BIGINT UNSIGNED NOT NULL,
    `customerId` BIGINT UNSIGNED NOT NULL,
    `lenderId` VARCHAR(191) NOT NULL,
    `consentVersion` VARCHAR(50) NOT NULL,
    `consentTemplateId` VARCHAR(100) NOT NULL,
    `consentText` TEXT NOT NULL,
    `consentTextHash` CHAR(64) NOT NULL,
    `consentReference` VARCHAR(150) NULL,
    `acceptedAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LenderDataSharingConsent_customerId_acceptedAt_idx`(`customerId`, `acceptedAt`),
    INDEX `LenderDataSharingConsent_lenderId_acceptedAt_idx`(`lenderId`, `acceptedAt`),
    UNIQUE INDEX `LenderDataSharingConsent_applicationId_lenderId_consentVersi_key`(`applicationId`, `lenderId`, `consentVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LenderApplicationLink` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` BIGINT UNSIGNED NOT NULL,
    `applicationReference` VARCHAR(50) NOT NULL,
    `lenderId` VARCHAR(191) NOT NULL,
    `lenderProductId` VARCHAR(191) NOT NULL,
    `productStrategyVersionId` VARCHAR(191) NOT NULL,
    `integrationConfigId` VARCHAR(191) NOT NULL,
    `adapterKey` VARCHAR(80) NOT NULL,
    `adapterVersion` VARCHAR(30) NOT NULL,
    `partnerLeadId` VARCHAR(150) NULL,
    `partnerApplicationId` VARCHAR(150) NULL,
    `partnerReference` VARCHAR(150) NULL,
    `createStatus` ENUM('NOT_STARTED', 'PENDING', 'PROCESSING', 'ACKNOWLEDGED', 'RETRY_PENDING', 'FAILED', 'COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
    `updateStatus` ENUM('NOT_STARTED', 'PENDING', 'PROCESSING', 'ACKNOWLEDGED', 'RETRY_PENDING', 'FAILED', 'COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
    `decisionStatus` ENUM('NOT_STARTED', 'PENDING', 'PROCESSING', 'ACKNOWLEDGED', 'RETRY_PENDING', 'FAILED', 'COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
    `lastSyncedStage` ENUM('CREATE', 'UPDATE', 'DECISION', 'STATUS') NULL,
    `createIdempotencyKey` VARCHAR(191) NOT NULL,
    `updateIdempotencyKey` VARCHAR(191) NULL,
    `decisionIdempotencyKey` VARCHAR(191) NULL,
    `createPayloadVersion` INTEGER NOT NULL DEFAULT 1,
    `updatePayloadVersion` INTEGER NOT NULL DEFAULT 1,
    `decisionPayloadVersion` INTEGER NOT NULL DEFAULT 1,
    `normalizedDecision` ENUM('APPROVED', 'REJECTED', 'PENDING') NULL,
    `rejectionReasonCode` VARCHAR(100) NULL,
    `lastRequestHash` CHAR(64) NULL,
    `lastResponseStatus` VARCHAR(80) NULL,
    `lastAttemptAt` DATETIME(3) NULL,
    `lastSuccessAt` DATETIME(3) NULL,
    `lastErrorCode` VARCHAR(100) NULL,
    `lastErrorMessage` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LenderApplicationLink_applicationId_key`(`applicationId`),
    UNIQUE INDEX `LenderApplicationLink_createIdempotencyKey_key`(`createIdempotencyKey`),
    UNIQUE INDEX `LenderApplicationLink_updateIdempotencyKey_key`(`updateIdempotencyKey`),
    UNIQUE INDEX `LenderApplicationLink_decisionIdempotencyKey_key`(`decisionIdempotencyKey`),
    INDEX `LenderApplicationLink_lenderId_createStatus_idx`(`lenderId`, `createStatus`),
    INDEX `LenderApplicationLink_adapterKey_adapterVersion_idx`(`adapterKey`, `adapterVersion`),
    INDEX `LenderApplicationLink_partnerApplicationId_idx`(`partnerApplicationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LenderIntegrationOutbox` (
    `id` VARCHAR(191) NOT NULL,
    `eventType` ENUM('LENDER_CREATE_APPLICATION', 'LENDER_UPDATE_APPLICATION', 'LENDER_REQUEST_DECISION', 'LENDER_STATUS_CHECK') NOT NULL,
    `applicationId` BIGINT UNSIGNED NOT NULL,
    `applicationReference` VARCHAR(50) NOT NULL,
    `lenderId` VARCHAR(191) NOT NULL,
    `integrationStage` ENUM('CREATE', 'UPDATE', 'DECISION', 'STATUS') NOT NULL,
    `payloadVersion` INTEGER NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'RETRY_PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(100) NULL,
    `lockToken` CHAR(36) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `processedAt` DATETIME(3) NULL,
    `lastErrorCode` VARCHAR(100) NULL,
    `lastErrorMessage` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LenderIntegrationOutbox_idempotencyKey_key`(`idempotencyKey`),
    INDEX `LenderIntegrationOutbox_status_availableAt_createdAt_idx`(`status`, `availableAt`, `createdAt`),
    INDEX `LenderIntegrationOutbox_applicationId_integrationStage_idx`(`applicationId`, `integrationStage`),
    INDEX `LenderIntegrationOutbox_lenderId_status_idx`(`lenderId`, `status`),
    INDEX `LenderIntegrationOutbox_lockedAt_idx`(`lockedAt`),
    INDEX `LenderIntegrationOutbox_leaseExpiresAt_idx`(`leaseExpiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `application_employment_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` BIGINT UNSIGNED NOT NULL,
    `employmentType` ENUM('SALARIED', 'SELF_EMPLOYED') NOT NULL,
    `companyType` ENUM('PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'PARTNERSHIP', 'GOVERNMENT', 'OTHER') NULL,
    `companyName` VARCHAR(200) NULL,
    `designation` VARCHAR(150) NULL,
    `businessName` VARCHAR(200) NULL,
    `businessConstitution` ENUM('PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'OTHER') NULL,
    `monthlyIncome` DECIMAL(15, 2) NOT NULL,
    `annualTurnover` DECIMAL(15, 2) NULL,
    `employmentVintage` VARCHAR(50) NULL,
    `businessVintage` VARCHAR(50) NULL,
    `salaryMode` VARCHAR(50) NULL,
    `completedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `application_employment_snapshots_applicationId_key`(`applicationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    UNIQUE INDEX `application_kyc_snapshots_applicationId_key`(`applicationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    UNIQUE INDEX `application_addresses_applicationId_addressType_key`(`applicationId`, `addressType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `application_liveness` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` BIGINT UNSIGNED NOT NULL,
    `photoDocumentId` BIGINT UNSIGNED NULL,
    `provider` VARCHAR(50) NOT NULL,
    `providerTransactionId` VARCHAR(150) NOT NULL,
    `verificationStatus` ENUM('PENDING', 'VERIFIED', 'FAILED') NOT NULL,
    `score` DECIMAL(5, 4) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `evidenceReference` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `application_liveness_applicationId_key`(`applicationId`),
    UNIQUE INDEX `application_liveness_photoDocumentId_key`(`photoDocumentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    INDEX `application_stage_consents_applicationId_consentType_accepte_idx`(`applicationId`, `consentType`, `acceptedAt`),
    UNIQUE INDEX `application_stage_consents_applicationId_lenderId_consentTyp_key`(`applicationId`, `lenderId`, `consentType`, `consentVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pl_loans` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `lan` VARCHAR(30) NOT NULL,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `application_id` BIGINT UNSIGNED NOT NULL,
    `lender_code` VARCHAR(30) NOT NULL,
    `status` ENUM('LENDER_APPROVED', 'OFFER_ACCEPTED', 'KYC_IN_PROGRESS', 'ADDRESS_CONFIRMED', 'BANK_VERIFIED', 'KFS_ACCEPTED', 'MANDATE_COMPLETED', 'ESIGN_COMPLETED', 'READY_FOR_DISBURSAL', 'DISBURSAL_PROCESSING', 'DISBURSED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'LENDER_APPROVED',
    `current_step` VARCHAR(50) NOT NULL DEFAULT 'APPROVAL_SUMMARY',
    `approved_amount` DECIMAL(15, 2) NOT NULL,
    `lender_approved_at` DATETIME(0) NOT NULL,
    `offer_status` VARCHAR(30) NULL,
    `offer_allowed_tenures` VARCHAR(200) NULL,
    `offer_valid_until` DATETIME(0) NULL,
    `accepted_tenure_days` INTEGER NULL,
    `offer_accepted_at` DATETIME(0) NULL,
    `accepted_interest_rate` DECIMAL(7, 4) NULL,
    `accepted_processing_fee` DECIMAL(15, 2) NULL,
    `accepted_emi_amount` DECIMAL(15, 2) NULL,
    `accepted_total_repayment` DECIMAL(15, 2) NULL,
    `digilocker_status` VARCHAR(30) NULL,
    `digilocker_session_id` VARCHAR(255) NULL,
    `digilocker_reference` VARCHAR(255) NULL,
    `aadhaar_masked_number` VARCHAR(20) NULL,
    `aadhaar_last_four` VARCHAR(4) NULL,
    `aadhaar_verified_name` VARCHAR(200) NULL,
    `aadhaar_date_of_birth` DATE NULL,
    `aadhaar_gender` VARCHAR(10) NULL,
    `aadhaar_care_of` VARCHAR(200) NULL,
    `aadhaar_addr_line1` VARCHAR(500) NULL,
    `aadhaar_addr_line2` VARCHAR(500) NULL,
    `aadhaar_landmark` VARCHAR(200) NULL,
    `aadhaar_locality` VARCHAR(200) NULL,
    `aadhaar_district` VARCHAR(100) NULL,
    `aadhaar_city` VARCHAR(100) NULL,
    `aadhaar_state` VARCHAR(100) NULL,
    `aadhaar_country` VARCHAR(50) NULL DEFAULT 'India',
    `aadhaar_pincode` VARCHAR(6) NULL,
    `aadhaar_formatted_addr` TEXT NULL,
    `digilocker_verified_at` DATETIME(0) NULL,
    `digilocker_consent_at` DATETIME(0) NULL,
    `digilocker_raw_response` LONGTEXT NULL,
    `address_confirmed` BOOLEAN NOT NULL DEFAULT false,
    `address_same_as_permanent` BOOLEAN NULL,
    `current_addr_line1` VARCHAR(500) NULL,
    `current_addr_line2` VARCHAR(500) NULL,
    `current_addr_landmark` VARCHAR(200) NULL,
    `current_addr_locality` VARCHAR(200) NULL,
    `current_addr_district` VARCHAR(100) NULL,
    `current_addr_city` VARCHAR(100) NULL,
    `current_addr_state` VARCHAR(100) NULL,
    `current_addr_country` VARCHAR(50) NULL DEFAULT 'India',
    `current_addr_pincode` VARCHAR(6) NULL,
    `current_addr_residence_since` VARCHAR(20) NULL,
    `current_addr_proof_type` VARCHAR(50) NULL,
    `current_addr_document_id` VARCHAR(100) NULL,
    `address_confirmed_at` DATETIME(0) NULL,
    `bank_verified` BOOLEAN NOT NULL DEFAULT false,
    `bank_account_holder_name` VARCHAR(200) NULL,
    `bank_account_type` VARCHAR(30) NULL,
    `bank_account_masked` VARCHAR(30) NULL,
    `bank_ifsc` VARCHAR(11) NULL,
    `bank_name` VARCHAR(100) NULL,
    `bank_provider_reference` VARCHAR(255) NULL,
    `bank_name_match_score` DECIMAL(5, 2) NULL,
    `bank_verified_at` DATETIME(0) NULL,
    `kfs_accepted` BOOLEAN NOT NULL DEFAULT false,
    `kfs_version` VARCHAR(20) NULL,
    `kfs_document_id` VARCHAR(100) NULL,
    `kfs_generated_at` DATETIME(0) NULL,
    `kfs_viewed_at` DATETIME(0) NULL,
    `kfs_accepted_at` DATETIME(0) NULL,
    `kfs_consent_text` TEXT NULL,
    `kfs_ip_address` VARCHAR(45) NULL,
    `kfs_user_agent` VARCHAR(500) NULL,
    `mandate_completed` BOOLEAN NOT NULL DEFAULT false,
    `mandate_status` VARCHAR(30) NULL,
    `mandate_provider_ref` VARCHAR(255) NULL,
    `mandate_initiated_at` DATETIME(0) NULL,
    `mandate_completed_at` DATETIME(0) NULL,
    `esign_completed` BOOLEAN NOT NULL DEFAULT false,
    `esign_status` VARCHAR(30) NULL,
    `esign_provider_ref` VARCHAR(255) NULL,
    `esign_document_types` VARCHAR(500) NULL,
    `esign_initiated_at` DATETIME(0) NULL,
    `esign_completed_at` DATETIME(0) NULL,
    `electronic_sign_status` ENUM('CREATED', 'DOCUMENT_READY', 'DOCUMENT_VIEWED', 'OTP_SENT', 'OTP_VERIFIED', 'SIGNING', 'SIGNED', 'FAILED', 'EXPIRED', 'CANCELLED') NULL,
    `electronic_sign_reference` VARCHAR(120) NULL,
    `electronic_signed_at` DATETIME(0) NULL,
    `accepted_agreement_document_id` BIGINT UNSIGNED NULL,
    `disbursal_status` VARCHAR(30) NULL,
    `disbursal_provider_ref` VARCHAR(255) NULL,
    `disbursal_amount` DECIMAL(15, 2) NULL,
    `disbursal_requested_at` DATETIME(0) NULL,
    `disbursal_completed_at` DATETIME(0) NULL,
    `disbursal_utr` VARCHAR(100) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `pl_loans_lan_key`(`lan`),
    INDEX `idx_pl_loans_customer_id`(`customer_id`),
    INDEX `idx_pl_loans_application_id`(`application_id`),
    INDEX `idx_pl_loans_status`(`status`),
    INDEX `idx_pl_loans_lender_code`(`lender_code`),
    UNIQUE INDEX `uk_pl_loans_application_id`(`application_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pl_loan_mandates` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `loan_id` BIGINT UNSIGNED NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `application_id` VARCHAR(191) NULL,
    `lan` VARCHAR(30) NOT NULL,
    `provider` ENUM('EASEBUZZ') NOT NULL DEFAULT 'EASEBUZZ',
    `mandate_type` ENUM('ENACH', 'UPI', 'SI') NOT NULL,
    `merchant_transaction_id` VARCHAR(40) NOT NULL,
    `provider_mandate_id` VARCHAR(255) NULL,
    `access_key` VARCHAR(500) NULL,
    `access_key_expires_at` DATETIME(0) NULL,
    `portal_url` TEXT NULL,
    `status` ENUM('CREATED', 'ACCESS_KEY_GENERATING', 'ACCESS_KEY_GENERATED', 'INITIATED', 'REQUESTED', 'AUTHORIZED', 'FAILED', 'REJECTED', 'CANCELLED', 'USER_CANCELLED', 'EXPIRED', 'REVOKED', 'PAUSED', 'COMPLETED', 'DROPPED', 'BOUNCED', 'UNKNOWN') NOT NULL DEFAULT 'CREATED',
    `provider_status` VARCHAR(100) NULL,
    `provider_sub_status` VARCHAR(100) NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `amount_rule` VARCHAR(20) NOT NULL DEFAULT 'MAX',
    `frequency` VARCHAR(30) NOT NULL DEFAULT 'monthly',
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `account_number_masked` VARCHAR(30) NULL,
    `ifsc_masked` VARCHAR(20) NULL,
    `account_type` VARCHAR(20) NULL,
    `account_holder_name` VARCHAR(150) NULL,
    `umrn` VARCHAR(255) NULL,
    `bank_reference_number` VARCHAR(255) NULL,
    `tpv_validation_status` VARCHAR(50) NULL,
    `authorized_at` DATETIME(0) NULL,
    `failed_at` DATETIME(0) NULL,
    `expires_at` DATETIME(0) NULL,
    `last_status_checked_at` DATETIME(0) NULL,
    `provider_request_json` LONGTEXT NULL,
    `provider_response_json` LONGTEXT NULL,
    `callback_response_json` LONGTEXT NULL,
    `webhook_response_json` LONGTEXT NULL,
    `failure_code` VARCHAR(100) NULL,
    `failure_reason` VARCHAR(500) NULL,
    `initiation_count` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `uk_pl_loan_mandate_transaction`(`merchant_transaction_id`),
    UNIQUE INDEX `uk_pl_loan_mandate_provider_id`(`provider_mandate_id`),
    INDEX `idx_pl_mandate_loan_status`(`loan_id`, `status`),
    INDEX `idx_pl_mandate_customer`(`customer_id`),
    INDEX `idx_pl_mandate_lan`(`lan`),
    INDEX `idx_pl_mandate_provider`(`provider_mandate_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pl_loan_audit_events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `loan_id` BIGINT UNSIGNED NOT NULL,
    `lan` VARCHAR(30) NOT NULL,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `application_id` BIGINT UNSIGNED NOT NULL,
    `event_type` VARCHAR(80) NOT NULL,
    `metadata` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_pl_loan_audit_loan_id`(`loan_id`),
    INDEX `idx_pl_loan_audit_event_type`(`event_type`, `created_at`),
    INDEX `idx_pl_loan_audit_customer_id`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmPolicy` (
    `id` VARCHAR(191) NOT NULL,
    `platformProductId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `description` VARCHAR(500) NULL,
    `scopeCode` VARCHAR(60) NOT NULL DEFAULT 'PLATFORM_DEFAULT',
    `operationalStatus` ENUM('INACTIVE', 'ACTIVE') NOT NULL DEFAULT 'INACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MlmPolicy_code_key`(`code`),
    INDEX `MlmPolicy_scopeCode_operationalStatus_idx`(`scopeCode`, `operationalStatus`),
    INDEX `MlmPolicy_operationalStatus_updatedAt_idx`(`operationalStatus`, `updatedAt`),
    INDEX `MlmPolicy_platformProductId_operationalStatus_idx`(`platformProductId`, `operationalStatus`),
    INDEX `MlmPolicy_scopeCode_platformProductId_operationalStatus_idx`(`scopeCode`, `platformProductId`, `operationalStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmPolicyVersion` (
    `id` VARCHAR(191) NOT NULL,
    `policyId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
    `allocationMethod` ENUM('WEIGHTED_FAIR_SHARE', 'PRIORITY_FALLBACK') NOT NULL,
    `distributionBasis` ENUM('APPLICATION_COUNT', 'ALLOCATED_AMOUNT') NULL,
    `effectiveFrom` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `submittedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `rejectedById` VARCHAR(191) NULL,
    `activatedById` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `activatedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MlmPolicyVersion_policyId_status_idx`(`policyId`, `status`),
    INDEX `MlmPolicyVersion_status_updatedAt_idx`(`status`, `updatedAt`),
    UNIQUE INDEX `MlmPolicyVersion_policyId_versionNumber_key`(`policyId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmAllocationRoute` (
    `id` VARCHAR(191) NOT NULL,
    `mlmPolicyVersionId` VARCHAR(191) NOT NULL,
    `lenderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `customerSegment` ENUM('ALL', 'NEW', 'REPEAT') NOT NULL DEFAULT 'ALL',
    `allocationWeightPercent` DECIMAL(7, 4) NULL,
    `priority` INTEGER NOT NULL,
    `minimumTicketAmount` DECIMAL(12, 2) NULL,
    `maximumTicketAmount` DECIMAL(12, 2) NULL,
    `capacityPeriod` ENUM('DAILY', 'MONTHLY') NOT NULL,
    `maximumApplicationCount` INTEGER NULL,
    `maximumAllocatedAmount` DECIMAL(16, 2) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MlmAllocationRoute_mlmPolicyVersionId_isActive_idx`(`mlmPolicyVersionId`, `isActive`),
    INDEX `MlmAllocationRoute_lenderId_productId_idx`(`lenderId`, `productId`),
    INDEX `MlmAllocationRoute_customerSegment_idx`(`customerSegment`),
    UNIQUE INDEX `MlmAllocationRoute_mlmPolicyVersionId_lenderId_productId_cus_key`(`mlmPolicyVersionId`, `lenderId`, `productId`, `customerSegment`),
    UNIQUE INDEX `MlmAllocationRoute_mlmPolicyVersionId_sortOrder_key`(`mlmPolicyVersionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmCapacityUsage` (
    `id` VARCHAR(191) NOT NULL,
    `lenderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `capacityPeriod` ENUM('DAILY', 'MONTHLY') NOT NULL,
    `periodKey` VARCHAR(20) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `allocatedApplicationCount` INTEGER NOT NULL DEFAULT 0,
    `allocatedAmount` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MlmCapacityUsage_periodStart_periodEnd_idx`(`periodStart`, `periodEnd`),
    INDEX `MlmCapacityUsage_lenderId_productId_idx`(`lenderId`, `productId`),
    UNIQUE INDEX `MlmCapacityUsage_lenderId_productId_capacityPeriod_periodKey_key`(`lenderId`, `productId`, `capacityPeriod`, `periodKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmAllocationDecision` (
    `id` VARCHAR(191) NOT NULL,
    `applicationReference` VARCHAR(100) NOT NULL,
    `policyId` VARCHAR(191) NULL,
    `policyVersionId` VARCHAR(191) NULL,
    `routeId` VARCHAR(191) NULL,
    `lenderId` VARCHAR(191) NULL,
    `platformProductId` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NULL,
    `productVersionId` VARCHAR(191) NULL,
    `platformPolicyVersionId` VARCHAR(191) NULL,
    `platformEvaluationReference` VARCHAR(191) NULL,
    `requestedAmount` DECIMAL(12, 2) NULL,
    `customerSegment` ENUM('ALL', 'NEW', 'REPEAT') NOT NULL,
    `platformDecisionOutcome` ENUM('PASS', 'FAIL', 'REFER') NOT NULL,
    `status` ENUM('PENDING', 'ASSIGNED', 'NO_ELIGIBLE_ROUTE') NOT NULL DEFAULT 'PENDING',
    `allocationMethod` ENUM('WEIGHTED_FAIR_SHARE', 'PRIORITY_FALLBACK') NULL,
    `distributionBasis` ENUM('APPLICATION_COUNT', 'ALLOCATED_AMOUNT') NULL,
    `selectedWeightPercent` DECIMAL(7, 4) NULL,
    `selectedPriority` INTEGER NULL,
    `capacityPeriod` ENUM('DAILY', 'MONTHLY') NULL,
    `capacityPeriodKey` VARCHAR(20) NULL,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `decisionReasonCode` VARCHAR(100) NULL,
    `decisionSnapshot` JSON NULL,
    `assignedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MlmAllocationDecision_applicationReference_key`(`applicationReference`),
    INDEX `MlmAllocationDecision_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `MlmAllocationDecision_lenderId_productId_idx`(`lenderId`, `productId`),
    INDEX `MlmAllocationDecision_policyVersionId_idx`(`policyVersionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmAllocationAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `decisionId` VARCHAR(191) NOT NULL,
    `policyVersionId` VARCHAR(191) NULL,
    `attemptNumber` INTEGER NOT NULL,
    `outcome` ENUM('ASSIGNED', 'NO_ELIGIBLE_ROUTE', 'REJECTED_BY_PLATFORM_POLICY', 'ERROR') NOT NULL,
    `requestedAmount` DECIMAL(12, 2) NULL,
    `candidateResults` JSON NOT NULL,
    `selectedRouteId` VARCHAR(191) NULL,
    `reasonCode` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MlmAllocationAttempt_decisionId_createdAt_idx`(`decisionId`, `createdAt`),
    UNIQUE INDEX `MlmAllocationAttempt_decisionId_attemptNumber_key`(`decisionId`, `attemptNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformProduct` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `description` VARCHAR(500) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlatformProduct_code_key`(`code`),
    INDEX `PlatformProduct_status_name_idx`(`status`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MlmAllocationRouteState` (
    `id` VARCHAR(191) NOT NULL,
    `mlmPolicyVersionId` VARCHAR(191) NOT NULL,
    `routeId` VARCHAR(191) NOT NULL,
    `currentWeight` DECIMAL(12, 4) NOT NULL DEFAULT 0,
    `allocatedApplicationCount` INTEGER NOT NULL DEFAULT 0,
    `allocatedAmount` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `lastAllocatedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MlmAllocationRouteState_routeId_key`(`routeId`),
    INDEX `MlmAllocationRouteState_mlmPolicyVersionId_idx`(`mlmPolicyVersionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pl_bank_verifications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `loan_id` BIGINT UNSIGNED NOT NULL,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `application_id` BIGINT UNSIGNED NOT NULL,
    `lan` VARCHAR(30) NOT NULL,
    `account_holder_name` VARCHAR(200) NOT NULL,
    `account_type` ENUM('SAVINGS', 'CURRENT') NOT NULL,
    `account_number_encrypted` TEXT NOT NULL,
    `account_number_masked` VARCHAR(30) NOT NULL,
    `account_number_fingerprint` CHAR(64) NOT NULL,
    `ifsc_code` VARCHAR(11) NOT NULL,
    `bank_name` VARCHAR(150) NULL,
    `branch_name` VARCHAR(150) NULL,
    `provider` VARCHAR(30) NOT NULL DEFAULT 'DIGIO',
    `provider_reference` VARCHAR(255) NULL,
    `provider_verified` BOOLEAN NOT NULL DEFAULT false,
    `provider_beneficiary_name` VARCHAR(200) NULL,
    `provider_bank_name` VARCHAR(150) NULL,
    `provider_branch_name` VARCHAR(150) NULL,
    `fuzzy_match_score` DECIMAL(5, 2) NULL,
    `name_match_threshold` DECIMAL(5, 2) NULL,
    `name_matched` BOOLEAN NOT NULL DEFAULT false,
    `verification_amount` DECIMAL(5, 2) NULL,
    `status` ENUM('INITIATED', 'VERIFIED', 'FAILED', 'NAME_MISMATCH', 'PROVIDER_ERROR') NOT NULL DEFAULT 'INITIATED',
    `verified_at` DATETIME(0) NULL,
    `failure_code` VARCHAR(100) NULL,
    `failure_reason` VARCHAR(500) NULL,
    `raw_response` LONGTEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `uk_pl_bank_verification_loan_id`(`loan_id`),
    UNIQUE INDEX `pl_bank_verifications_lan_key`(`lan`),
    UNIQUE INDEX `uk_pl_bank_provider_ref`(`provider_reference`),
    INDEX `idx_pl_bank_verification_customer`(`customer_id`),
    INDEX `idx_pl_bank_verification_application`(`application_id`),
    INDEX `idx_pl_bank_verification_status`(`status`),
    INDEX `idx_pl_bank_verification_fingerprint`(`account_number_fingerprint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pl_electronic_sign_transactions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `loan_id` BIGINT UNSIGNED NOT NULL,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `application_id` BIGINT UNSIGNED NOT NULL,
    `lan` VARCHAR(30) NOT NULL,
    `document_type` ENUM('LOAN_AGREEMENT', 'SANCTION_LETTER', 'KFS_ACKNOWLEDGEMENT', 'OTHER') NOT NULL,
    `document_version` VARCHAR(50) NOT NULL,
    `original_document_path` VARCHAR(500) NOT NULL,
    `original_document_hash` CHAR(64) NOT NULL,
    `original_document_size` BIGINT UNSIGNED NULL,
    `accepted_document_path` VARCHAR(500) NULL,
    `accepted_document_hash` CHAR(64) NULL,
    `accepted_document_size` BIGINT UNSIGNED NULL,
    `audit_certificate_path` VARCHAR(500) NULL,
    `audit_certificate_hash` CHAR(64) NULL,
    `otp_session_id` VARCHAR(120) NULL,
    `otp_hash` VARCHAR(255) NULL,
    `otp_expires_at` DATETIME(0) NULL,
    `otp_sent_at` DATETIME(0) NULL,
    `otp_verified_at` DATETIME(0) NULL,
    `otp_failed_attempts` INTEGER NOT NULL DEFAULT 0,
    `otp_resend_count` INTEGER NOT NULL DEFAULT 0,
    `signer_name` VARCHAR(200) NOT NULL,
    `verified_mobile_masked` VARCHAR(20) NOT NULL,
    `consent_text` LONGTEXT NOT NULL,
    `consent_version` VARCHAR(50) NOT NULL,
    `consented_at` DATETIME(0) NULL,
    `document_viewed_at` DATETIME(0) NULL,
    `ip_address` VARCHAR(45) NULL,
    `forwarded_for` VARCHAR(1000) NULL,
    `user_agent` VARCHAR(1000) NULL,
    `request_id` VARCHAR(120) NULL,
    `authenticated_session_id` VARCHAR(120) NULL,
    `signed_page_number` INTEGER NULL,
    `signed_at` DATETIME(0) NULL,
    `status` ENUM('CREATED', 'DOCUMENT_READY', 'DOCUMENT_VIEWED', 'OTP_SENT', 'OTP_VERIFIED', 'SIGNING', 'SIGNED', 'FAILED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'CREATED',
    `failure_code` VARCHAR(100) NULL,
    `failure_reason` VARCHAR(500) NULL,
    `evidence_json` LONGTEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `pl_electronic_sign_transactions_otp_session_id_key`(`otp_session_id`),
    INDEX `idx_pl_esign_customer`(`customer_id`),
    INDEX `idx_pl_esign_application`(`application_id`),
    INDEX `idx_pl_esign_status`(`status`),
    INDEX `idx_pl_esign_lan`(`lan`),
    UNIQUE INDEX `uk_pl_esign_loan_document_version`(`loan_id`, `document_type`, `document_version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_assignedBy_fkey` FOREIGN KEY (`assignedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_parentTokenId_fkey` FOREIGN KEY (`parentTokenId`) REFERENCES `RefreshToken`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoginAttempt` ADD CONSTRAINT `LoginAttempt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SecurityEvent` ADD CONSTRAINT `SecurityEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SecurityEvent` ADD CONSTRAINT `SecurityEvent_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lender` ADD CONSTRAINT `Lender_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lender` ADD CONSTRAINT `Lender_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lender` ADD CONSTRAINT `Lender_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lender` ADD CONSTRAINT `Lender_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lender` ADD CONSTRAINT `Lender_rejectedById_fkey` FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProduct` ADD CONSTRAINT `LenderProduct_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProduct` ADD CONSTRAINT `LenderProduct_platformProductId_fkey` FOREIGN KEY (`platformProductId`) REFERENCES `PlatformProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProduct` ADD CONSTRAINT `LenderProduct_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProduct` ADD CONSTRAINT `LenderProduct_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProductVersion` ADD CONSTRAINT `LenderProductVersion_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `LenderProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProductVersion` ADD CONSTRAINT `LenderProductVersion_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProductVersion` ADD CONSTRAINT `LenderProductVersion_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProductVersion` ADD CONSTRAINT `LenderProductVersion_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProductVersion` ADD CONSTRAINT `LenderProductVersion_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProductVersion` ADD CONSTRAINT `LenderProductVersion_rejectedById_fkey` FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProductVersion` ADD CONSTRAINT `LenderProductVersion_activatedById_fkey` FOREIGN KEY (`activatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderOfferMultiplier` ADD CONSTRAINT `LenderOfferMultiplier_productVersionId_fkey` FOREIGN KEY (`productVersionId`) REFERENCES `LenderProductVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LenderProductTenure` ADD CONSTRAINT `LenderProductTenure_productVersionId_fkey` FOREIGN KEY (`productVersionId`) REFERENCES `LenderProductVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `otp_sessions` ADD CONSTRAINT `otp_sessions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_sessions` ADD CONSTRAINT `customer_sessions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_refresh_tokens` ADD CONSTRAINT `customer_refresh_tokens_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `customer_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_refresh_tokens` ADD CONSTRAINT `customer_refresh_tokens_parent_token_id_fkey` FOREIGN KEY (`parent_token_id`) REFERENCES `customer_refresh_tokens`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kyc_verification_status` ADD CONSTRAINT `kyc_verification_status_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicy` ADD CONSTRAINT `PlatformPolicy_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicy` ADD CONSTRAINT `PlatformPolicy_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `PlatformPolicy`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_rejectedById_fkey` FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyVersion` ADD CONSTRAINT `PlatformPolicyVersion_activatedById_fkey` FOREIGN KEY (`activatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformPolicyRule` ADD CONSTRAINT `PlatformPolicyRule_policyVersionId_fkey` FOREIGN KEY (`policyVersionId`) REFERENCES `PlatformPolicyVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_payment_links` ADD CONSTRAINT `pl_payment_links_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_payment_links` ADD CONSTRAINT `pl_payment_links_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_customer_documents` ADD CONSTRAINT `pl_customer_documents_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `pl_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_customer_documents` ADD CONSTRAINT `pl_customer_documents_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_applications` ADD CONSTRAINT `pl_applications_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE `pl_loans` ADD CONSTRAINT `pl_loans_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_loans` ADD CONSTRAINT `pl_loans_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `pl_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_loan_mandates` ADD CONSTRAINT `pl_loan_mandates_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `pl_loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_loan_audit_events` ADD CONSTRAINT `pl_loan_audit_events_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `pl_loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicy` ADD CONSTRAINT `MlmPolicy_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicy` ADD CONSTRAINT `MlmPolicy_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicy` ADD CONSTRAINT `MlmPolicy_platformProductId_fkey` FOREIGN KEY (`platformProductId`) REFERENCES `PlatformProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `MlmPolicy`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_rejectedById_fkey` FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmPolicyVersion` ADD CONSTRAINT `MlmPolicyVersion_activatedById_fkey` FOREIGN KEY (`activatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationRoute` ADD CONSTRAINT `MlmAllocationRoute_mlmPolicyVersionId_fkey` FOREIGN KEY (`mlmPolicyVersionId`) REFERENCES `MlmPolicyVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationRoute` ADD CONSTRAINT `MlmAllocationRoute_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationRoute` ADD CONSTRAINT `MlmAllocationRoute_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `LenderProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmCapacityUsage` ADD CONSTRAINT `MlmCapacityUsage_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmCapacityUsage` ADD CONSTRAINT `MlmCapacityUsage_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `LenderProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `MlmPolicy`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_policyVersionId_fkey` FOREIGN KEY (`policyVersionId`) REFERENCES `MlmPolicyVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_routeId_fkey` FOREIGN KEY (`routeId`) REFERENCES `MlmAllocationRoute`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `Lender`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_platformProductId_fkey` FOREIGN KEY (`platformProductId`) REFERENCES `PlatformProduct`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationDecision` ADD CONSTRAINT `MlmAllocationDecision_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `LenderProduct`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationAttempt` ADD CONSTRAINT `MlmAllocationAttempt_decisionId_fkey` FOREIGN KEY (`decisionId`) REFERENCES `MlmAllocationDecision`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationAttempt` ADD CONSTRAINT `MlmAllocationAttempt_policyVersionId_fkey` FOREIGN KEY (`policyVersionId`) REFERENCES `MlmPolicyVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformProduct` ADD CONSTRAINT `PlatformProduct_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformProduct` ADD CONSTRAINT `PlatformProduct_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationRouteState` ADD CONSTRAINT `MlmAllocationRouteState_mlmPolicyVersionId_fkey` FOREIGN KEY (`mlmPolicyVersionId`) REFERENCES `MlmPolicyVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MlmAllocationRouteState` ADD CONSTRAINT `MlmAllocationRouteState_routeId_fkey` FOREIGN KEY (`routeId`) REFERENCES `MlmAllocationRoute`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pl_bank_verifications` ADD CONSTRAINT `pl_bank_verifications_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `pl_loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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

