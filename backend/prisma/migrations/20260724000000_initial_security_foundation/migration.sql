-- Phase 1 authentication, RBAC, session, security-event and audit foundation.
CREATE TABLE `User` (
  `id` VARCHAR(191) NOT NULL, `name` VARCHAR(120) NOT NULL, `email` VARCHAR(254) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL, `status` ENUM('ACTIVE','INACTIVE','LOCKED','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  `failedLoginCount` INTEGER NOT NULL DEFAULT 0, `lockedUntil` DATETIME(3) NULL, `lastLoginAt` DATETIME(3) NULL,
  `passwordChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `authVersion` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `User_email_key`(`email`), INDEX `User_status_idx`(`status`), INDEX `User_lockedUntil_idx`(`lockedUntil`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Role` (
  `id` VARCHAR(191) NOT NULL, `name` VARCHAR(100) NOT NULL, `code` VARCHAR(80) NOT NULL, `description` VARCHAR(255) NULL,
  `status` ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE', `isSystem` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Role_code_key`(`code`), INDEX `Role_status_idx`(`status`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Permission` (
  `id` VARCHAR(191) NOT NULL, `code` VARCHAR(100) NOT NULL, `module` VARCHAR(80) NOT NULL, `description` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Permission_code_key`(`code`), INDEX `Permission_module_idx`(`module`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserRole` (
  `userId` VARCHAR(191) NOT NULL, `roleId` VARCHAR(191) NOT NULL, `assignedBy` VARCHAR(191) NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `UserRole_roleId_idx`(`roleId`), INDEX `UserRole_assignedBy_idx`(`assignedBy`), PRIMARY KEY (`userId`,`roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RolePermission` (
  `roleId` VARCHAR(191) NOT NULL, `permissionId` VARCHAR(191) NOT NULL, `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `RolePermission_permissionId_idx`(`permissionId`), PRIMARY KEY (`roleId`,`permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Session` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `absoluteExpiresAt` DATETIME(3) NOT NULL,
  `idleExpiresAt` DATETIME(3) NOT NULL, `revokedAt` DATETIME(3) NULL, `revokedReason` VARCHAR(120) NULL,
  `ipAddress` VARCHAR(64) NULL, `userAgent` VARCHAR(512) NULL, `deviceLabel` VARCHAR(160) NULL, `requestId` VARCHAR(64) NOT NULL,
  INDEX `Session_userId_revokedAt_idx`(`userId`,`revokedAt`), INDEX `Session_absoluteExpiresAt_idx`(`absoluteExpiresAt`),
  INDEX `Session_idleExpiresAt_idx`(`idleExpiresAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RefreshToken` (
  `id` VARCHAR(191) NOT NULL, `sessionId` VARCHAR(191) NOT NULL, `tokenHash` CHAR(64) NOT NULL,
  `parentTokenId` VARCHAR(191) NULL, `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL, `usedAt` DATETIME(3) NULL, `revokedAt` DATETIME(3) NULL,
  UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`), INDEX `RefreshToken_sessionId_revokedAt_idx`(`sessionId`,`revokedAt`),
  INDEX `RefreshToken_parentTokenId_idx`(`parentTokenId`), INDEX `RefreshToken_expiresAt_idx`(`expiresAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LoginAttempt` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NULL, `emailFingerprint` CHAR(64) NOT NULL,
  `maskedEmail` VARCHAR(254) NOT NULL, `outcome` ENUM('SUCCESS','FAILURE','LOCKED','DISABLED','RATE_LIMITED') NOT NULL,
  `reasonCode` VARCHAR(80) NOT NULL, `ipAddress` VARCHAR(64) NULL, `userAgent` VARCHAR(512) NULL,
  `requestId` VARCHAR(64) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `LoginAttempt_emailFingerprint_createdAt_idx`(`emailFingerprint`,`createdAt`),
  INDEX `LoginAttempt_userId_createdAt_idx`(`userId`,`createdAt`), INDEX `LoginAttempt_ipAddress_createdAt_idx`(`ipAddress`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SecurityEvent` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NULL, `sessionId` VARCHAR(191) NULL, `eventType` VARCHAR(80) NOT NULL,
  `severity` ENUM('INFO','LOW','MEDIUM','HIGH','CRITICAL') NOT NULL, `requestId` VARCHAR(64) NOT NULL,
  `ipAddress` VARCHAR(64) NULL, `userAgent` VARCHAR(512) NULL, `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `SecurityEvent_eventType_createdAt_idx`(`eventType`,`createdAt`), INDEX `SecurityEvent_severity_createdAt_idx`(`severity`,`createdAt`),
  INDEX `SecurityEvent_userId_createdAt_idx`(`userId`,`createdAt`), INDEX `SecurityEvent_sessionId_createdAt_idx`(`sessionId`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuditLog` (
  `id` VARCHAR(191) NOT NULL, `actorUserId` VARCHAR(191) NULL, `actorRoleCodes` JSON NOT NULL,
  `permissionCode` VARCHAR(100) NULL, `module` VARCHAR(80) NOT NULL, `action` VARCHAR(100) NOT NULL,
  `entityType` VARCHAR(80) NOT NULL, `entityId` VARCHAR(191) NULL, `outcome` ENUM('SUCCESS','FAILURE','DENIED') NOT NULL,
  `reason` VARCHAR(255) NULL, `previousValue` JSON NULL, `newValue` JSON NULL, `requestId` VARCHAR(64) NOT NULL,
  `ipAddress` VARCHAR(64) NULL, `userAgent` VARCHAR(512) NULL, `integrityHash` CHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AuditLog_actorUserId_createdAt_idx`(`actorUserId`,`createdAt`), INDEX `AuditLog_module_action_createdAt_idx`(`module`,`action`,`createdAt`),
  INDEX `AuditLog_entityType_entityId_idx`(`entityType`,`entityId`), INDEX `AuditLog_requestId_idx`(`requestId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_assignedBy_fkey` FOREIGN KEY (`assignedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_parentTokenId_fkey` FOREIGN KEY (`parentTokenId`) REFERENCES `RefreshToken`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `LoginAttempt` ADD CONSTRAINT `LoginAttempt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SecurityEvent` ADD CONSTRAINT `SecurityEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SecurityEvent` ADD CONSTRAINT `SecurityEvent_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
