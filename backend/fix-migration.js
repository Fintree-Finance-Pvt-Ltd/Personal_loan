const fs = require('fs');
const file = 'prisma/migrations/20260728000000_add_platform_product_mapping_and_product_scoped_mlm/migration.sql';
let sql = fs.readFileSync(file, 'utf8');

const match = sql.match(/-- CreateTable\r?\nCREATE TABLE `PlatformProduct`[\s\S]*?;\r?\n/);
if (match) {
  sql = sql.replace(match[0], '');
  const insertStr = `
-- Insert default PlatformProduct for migration backfill
INSERT INTO \`PlatformProduct\` (\`id\`, \`name\`, \`code\`, \`description\`, \`status\`, \`createdById\`, \`updatedById\`, \`createdAt\`, \`updatedAt\`)
VALUES ('PLAT_PROD_001', 'Personal Loan Standard', 'PERSONAL_LOAN_STANDARD', 'Standard Personal Loan Product for Platform', 'ACTIVE', 'SYSTEM', 'SYSTEM', NOW(), NOW());
`;
  sql = match[0] + insertStr + sql;
}
fs.writeFileSync(file, sql);
