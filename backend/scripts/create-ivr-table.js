const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTable() {
  const sql = `
CREATE TABLE IF NOT EXISTS \`ivr_call_logs\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`customer_id\` BIGINT UNSIGNED NULL,
  \`application_id\` BIGINT UNSIGNED NULL,
  \`lan\` VARCHAR(50) NULL,
  \`customer_mobile\` VARCHAR(20) NOT NULL,
  \`provider_call_id\` VARCHAR(120) NOT NULL,
  \`agent_id\` VARCHAR(120) NULL,
  \`call_type\` ENUM('GENERIC', 'APPLICATION_FOLLOW_UP', 'DOCUMENT_PENDING', 'KYC_PENDING', 'LOAN_APPROVAL', 'DISBURSEMENT_CONFIRMATION', 'EMI_REMINDER', 'PAYMENT_FOLLOW_UP', 'CUSTOMER_SUPPORT') NOT NULL DEFAULT 'APPLICATION_FOLLOW_UP',
  \`trigger_source\` ENUM('ADMIN', 'RM', 'SYSTEM', 'CREDIT', 'OPERATIONS') NOT NULL DEFAULT 'ADMIN',
  \`triggered_by_id\` VARCHAR(120) NULL,
  \`status\` VARCHAR(50) NOT NULL DEFAULT 'INITIATED',
  \`duration\` INT UNSIGNED NULL,
  \`start_time\` DATETIME NULL,
  \`end_time\` DATETIME NULL,
  \`call_summary\` TEXT NULL,
  \`transcript\` LONGTEXT NULL,
  \`recording_link\` VARCHAR(1000) NULL,
  \`custom_data\` JSON NULL,
  \`provider_response\` JSON NULL,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  INDEX \`idx_ivr_calls_customer\` (\`customer_id\`),
  INDEX \`idx_ivr_calls_app\` (\`application_id\`),
  INDEX \`idx_ivr_calls_lan\` (\`lan\`),
  INDEX \`idx_ivr_calls_provider_id\` (\`provider_call_id\`),
  INDEX \`idx_ivr_calls_status\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  try {
    console.log('Creating ivr_call_logs table...');
    await prisma.$executeRawUnsafe(sql);
    console.log('ivr_call_logs table created successfully.');
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    await prisma.$disconnect();
  }
}

createTable();
