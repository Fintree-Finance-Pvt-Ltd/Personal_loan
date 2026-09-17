const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('Creating referral tables...');

  const sqls = [
    `CREATE TABLE IF NOT EXISTS referral_campaigns (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      campaign_name VARCHAR(150) NOT NULL,
      reward_type ENUM('PROCESSING_FEE_DISCOUNT') NOT NULL DEFAULT 'PROCESSING_FEE_DISCOUNT',
      discount_type ENUM('PERCENTAGE', 'FIXED_AMOUNT') NOT NULL DEFAULT 'PERCENTAGE',
      discount_value DECIMAL(10, 2) NOT NULL,
      max_discount_limit DECIMAL(15, 2) NOT NULL,
      min_referral_requirement INT NOT NULL DEFAULT 1,
      applicable_loan_number INT NOT NULL DEFAULT 2,
      validity_days INT NOT NULL DEFAULT 90,
      status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_referral_campaign_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS customer_referral_mappings (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      referrer_customer_id BIGINT UNSIGNED NOT NULL,
      referred_customer_id BIGINT UNSIGNED NOT NULL UNIQUE,
      referral_code VARCHAR(30) NOT NULL,
      status ENUM('PENDING', 'QUALIFIED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
      disbursed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cust_ref_referrer_id (referrer_customer_id),
      INDEX idx_cust_ref_referred_id (referred_customer_id),
      INDEX idx_cust_ref_code (referral_code),
      INDEX idx_cust_ref_status (status),
      CONSTRAINT fk_cust_ref_referrer FOREIGN KEY (referrer_customer_id) REFERENCES customers (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_cust_ref_referred FOREIGN KEY (referred_customer_id) REFERENCES customers (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS customer_benefits (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      customer_id BIGINT UNSIGNED NOT NULL,
      campaign_id BIGINT UNSIGNED NULL,
      source_referral_id BIGINT UNSIGNED NULL,
      benefit_type ENUM('PROCESSING_FEE_DISCOUNT') NOT NULL DEFAULT 'PROCESSING_FEE_DISCOUNT',
      discount_type ENUM('PERCENTAGE', 'FIXED_AMOUNT') NOT NULL DEFAULT 'PERCENTAGE',
      discount_value DECIMAL(10, 2) NOT NULL,
      max_discount_limit DECIMAL(15, 2) NOT NULL,
      status ENUM('AVAILABLE', 'APPLIED', 'USED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'AVAILABLE',
      expiry_date DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cust_benefit_customer_id (customer_id),
      INDEX idx_cust_benefit_status (status),
      INDEX idx_cust_benefit_expiry (expiry_date),
      CONSTRAINT fk_cust_benefit_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_cust_benefit_campaign FOREIGN KEY (campaign_id) REFERENCES referral_campaigns (id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_cust_benefit_referral FOREIGN KEY (source_referral_id) REFERENCES customer_referral_mappings (id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS benefit_usage_histories (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      benefit_id BIGINT UNSIGNED NOT NULL,
      customer_id BIGINT UNSIGNED NOT NULL,
      application_id BIGINT UNSIGNED NULL,
      loan_id BIGINT UNSIGNED NULL,
      original_processing_fee DECIMAL(15, 2) NOT NULL,
      discount_applied DECIMAL(15, 2) NOT NULL,
      final_processing_fee DECIMAL(15, 2) NOT NULL,
      used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_benefit_usage_benefit_id (benefit_id),
      INDEX idx_benefit_usage_customer_id (customer_id),
      INDEX idx_benefit_usage_loan_id (loan_id),
      CONSTRAINT fk_benefit_usage_benefit FOREIGN KEY (benefit_id) REFERENCES customer_benefits (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_benefit_usage_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_benefit_usage_app FOREIGN KEY (application_id) REFERENCES pl_applications (id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_benefit_usage_loan FOREIGN KEY (loan_id) REFERENCES pl_loans (id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  ];

  for (const sql of sqls) {
    console.log('Executing table SQL...');
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('Success.');
    } catch (e) {
      console.error('Error executing SQL:', e.message);
    }
  }
}

run()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
  });
