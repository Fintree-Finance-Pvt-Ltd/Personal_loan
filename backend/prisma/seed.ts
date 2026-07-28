import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { validateEnvironment } from "../src/config/environment";
import { normalizeEmail } from "../src/common/utils/security.utils";
import { validatePasswordStrength } from "../src/common/utils/password.utils";

process.loadEnvFile(resolve(__dirname, "../.env"));
const env = validateEnvironment(process.env);
const prisma = new PrismaClient();

const roles = [
  ["SUPERADMIN", "Super Administrator"],
  ["SECURITY_ADMIN", "Security Administrator"],
  ['CONFIG_MAKER', 'Configuration Maker'],
  ['CONFIG_CHECKER', 'Configuration Checker'],
  ["OPERATIONS", "Operations"],
  ["CREDIT_MAKER", "Credit Maker"],
  ["CREDIT_CHECKER", "Credit Checker"],
  ["POLICY_MAKER", "Policy Maker"],
  ["POLICY_CHECKER", "Policy Checker"],
  ["FINANCE_MAKER", "Finance Maker"],
  ["FINANCE_CHECKER", "Finance Checker"],
  ["AUDITOR", "Auditor"],
  ["SUPPORT", "Support"],
  ["MLM_MAKER", "MLM Maker"],
  ["MLM_CHECKER", "MLM Checker"],
] as const;

const permissions = [
  ["ADMIN_DASHBOARD_VIEW", "ADMIN"],
  ["USER_READ", "USER"],
  ["USER_CREATE", "USER"],
  ["USER_UPDATE", "USER"],
  ["USER_DISABLE", "USER"],
  ["ROLE_READ", "RBAC"],
  ["ROLE_CREATE", "RBAC"],
  ["ROLE_UPDATE", "RBAC"],
  ["ROLE_ASSIGN", "RBAC"],
  ["PERMISSION_READ", "RBAC"],
  ["SESSION_READ_OWN", "AUTH"],
  ["SESSION_REVOKE_OWN", "AUTH"],
  ["SESSION_REVOKE_ALL", "AUTH"],
  ["AUDIT_LOG_VIEW", "AUDIT"],
  ["SECURITY_EVENT_VIEW", "SECURITY"],
  ["APPLICATION_VIEW_MASKED", "APPLICATION"],
  ["CUSTOMER_PII_VIEW_FULL", "CUSTOMER"],
  ["CUSTOMER_PII_EXPORT", "CUSTOMER"],
  ["POLICY_READ", "POLICY"],
  ["POLICY_CREATE", "POLICY"],
  ["POLICY_UPDATE", "POLICY"],
  ["POLICY_SUBMIT", "POLICY"],
  ["POLICY_APPROVE", "POLICY"],
  ["POLICY_REJECT", "POLICY"],
  ["POLICY_VERSION_CREATE", "POLICY"],
  ["POLICY_ACTIVATE", "POLICY"],
  ["POLICY_SIMULATE", "POLICY"],
  ["PAYMENT_REFUND_CREATE", "PAYMENT"],
  ["PAYMENT_REFUND_APPROVE", "PAYMENT"],
  ["LENDER_READ", "LENDER"],
  ["LENDER_CREATE", "LENDER"],
  ["LENDER_UPDATE", "LENDER"],
  ["LENDER_SUBMIT", "LENDER"],
  ["LENDER_APPROVE", "LENDER"],
  ["LENDER_REJECT", "LENDER"],
  ["LENDER_ACTIVATE", "LENDER"],
  ["LENDER_DEACTIVATE", "LENDER"],
  ["PLATFORM_PRODUCT_READ", "PRODUCT"],
  ["PLATFORM_PRODUCT_CREATE", "PRODUCT"],
  ["PLATFORM_PRODUCT_UPDATE", "PRODUCT"],
  ["PLATFORM_PRODUCT_ACTIVATE", "PRODUCT"],
  ["PLATFORM_PRODUCT_DEACTIVATE", "PRODUCT"],
  ["PRODUCT_READ", "PRODUCT"],
  ["PRODUCT_CREATE", "PRODUCT"],
  ["PRODUCT_UPDATE", "PRODUCT"],
  ["PRODUCT_SUBMIT", "PRODUCT"],
  ["PRODUCT_APPROVE", "PRODUCT"],
  ["PRODUCT_REJECT", "PRODUCT"],
  ["PRODUCT_VERSION_CREATE", "PRODUCT"],
  ["PRODUCT_ACTIVATE", "PRODUCT"],
  ["MLM_READ", "MLM"],
  ["MLM_CREATE", "MLM"],
  ["MLM_UPDATE", "MLM"],
  ["MLM_VERSION_CREATE", "MLM"],
  ["MLM_SUBMIT", "MLM"],
  ["MLM_APPROVE", "MLM"],
  ["MLM_REJECT", "MLM"],
  ["MLM_ACTIVATE", "MLM"],
  ["MLM_SIMULATE", "MLM"],
  ["MLM_CAPACITY_READ", "MLM"],
  ["MLM_EXECUTE", "MLM"],
] as const;

const ownSession = [
  "ADMIN_DASHBOARD_VIEW",
  "SESSION_READ_OWN",
  "SESSION_REVOKE_OWN",
];
const grants: Record<string, string[]> = {
  SECURITY_ADMIN: [
    ...ownSession,
    "USER_READ",
    "USER_DISABLE",
    "ROLE_READ",
    "ROLE_ASSIGN",
    "PERMISSION_READ",
    "SESSION_REVOKE_ALL",
    "AUDIT_LOG_VIEW",
    "SECURITY_EVENT_VIEW",
  ],
  CONFIG_MAKER: [
    ...ownSession,
    'LENDER_READ',
    'LENDER_CREATE',
    'LENDER_UPDATE',
    'LENDER_SUBMIT',
    "PLATFORM_PRODUCT_READ",
    'PRODUCT_READ',
    'PRODUCT_CREATE',
    'PRODUCT_UPDATE',
    'PRODUCT_SUBMIT',
    'PRODUCT_VERSION_CREATE',
  ],

  CONFIG_CHECKER: [
    ...ownSession,
    'LENDER_READ',
    'LENDER_APPROVE',
    'LENDER_REJECT',
    'LENDER_ACTIVATE',
    'LENDER_DEACTIVATE',
    "PLATFORM_PRODUCT_READ",
    "PLATFORM_PRODUCT_CREATE",
    "PLATFORM_PRODUCT_UPDATE",
    "PLATFORM_PRODUCT_ACTIVATE",
    "PLATFORM_PRODUCT_DEACTIVATE",
    'PRODUCT_READ',
    'PRODUCT_APPROVE',
    'PRODUCT_REJECT',
    'PRODUCT_ACTIVATE',
  ],
  OPERATIONS: [...ownSession, "LENDER_READ", "APPLICATION_VIEW_MASKED"],
  CREDIT_MAKER: [...ownSession, "APPLICATION_VIEW_MASKED"],
  CREDIT_CHECKER: [
    ...ownSession,
    "APPLICATION_VIEW_MASKED",
    "CUSTOMER_PII_VIEW_FULL",
  ],
  POLICY_MAKER: [
    ...ownSession,
    "POLICY_READ",
    "POLICY_CREATE",
    "POLICY_UPDATE",
    "POLICY_SUBMIT",
    "POLICY_VERSION_CREATE",
    "POLICY_SIMULATE",
  ],
  POLICY_CHECKER: [
    ...ownSession,
    "POLICY_READ",
    "POLICY_APPROVE",
    "POLICY_REJECT",
    "POLICY_ACTIVATE",
    "POLICY_SIMULATE",
  ],
  FINANCE_MAKER: [...ownSession, "PAYMENT_REFUND_CREATE"],
  FINANCE_CHECKER: [...ownSession, "PAYMENT_REFUND_APPROVE"],
  AUDITOR: [...ownSession, "LENDER_READ", "AUDIT_LOG_VIEW", "SECURITY_EVENT_VIEW", "PRODUCT_READ", "POLICY_READ"],
  SUPPORT: [...ownSession, "USER_READ", "LENDER_READ", "APPLICATION_VIEW_MASKED"],
  MLM_MAKER: [
    ...ownSession,
    "MLM_READ",
    "MLM_CREATE",
    "MLM_UPDATE",
    "MLM_VERSION_CREATE",
    "MLM_SUBMIT",
    "MLM_SIMULATE",
    "MLM_CAPACITY_READ",
  ],
  MLM_CHECKER: [
    ...ownSession,
    "MLM_READ",
    "MLM_APPROVE",
    "MLM_REJECT",
    "MLM_ACTIVATE",
    "MLM_SIMULATE",
    "MLM_CAPACITY_READ",
  ],
};

async function main(): Promise<void> {
  const name = env.SEED_SUPERADMIN_NAME.trim();
  const email = normalizeEmail(env.SEED_SUPERADMIN_EMAIL);
  const password = env.SEED_SUPERADMIN_PASSWORD;
  if (!name || !email || !password) {
    throw new Error(
      "SEED_SUPERADMIN_NAME, SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD are required.",
    );
  }
  const passwordErrors = validatePasswordStrength(password);
  if (passwordErrors.length > 0)
    throw new Error(`SEED_SUPERADMIN_PASSWORD ${passwordErrors.join(", ")}.`);

  for (const [code, roleName] of roles) {
    await prisma.role.upsert({
      where: { code },
      create: {
        code,
        name: roleName,
        description: `${roleName} system role`,
        isSystem: true,
      },
      update: { name: roleName, status: "ACTIVE" },
      select: { id: true },
    });
  }
  for (const [code, module] of permissions) {
    await prisma.permission.upsert({
      where: { code },
      create: {
        code,
        module,
        description: `${code.replaceAll("_", " ").toLowerCase()} permission`,
      },
      update: { module },
      select: { id: true },
    });
  }
  const roleRows = await prisma.role.findMany({
    select: { id: true, code: true },
  });
  const permissionRows = await prisma.permission.findMany({
    select: { id: true, code: true },
  });
  const roleByCode = new Map(roleRows.map((role) => [role.code, role.id]));
  const permissionByCode = new Map(
    permissionRows.map((permission) => [permission.code, permission.id]),
  );
  for (const [roleCode] of roles) {
    const codes =
      roleCode === "SUPERADMIN"
        ? permissionRows.map(({ code }) => code)
        : (grants[roleCode] ?? []);
    await prisma.rolePermission.createMany({
      data: codes.map((code) => ({
        roleId: roleByCode.get(roleCode)!,
        permissionId: permissionByCode.get(code)!,
      })),
      skipDuplicates: true,
    });
  }
  let user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: env.ARGON2_MEMORY_COST,
      timeCost: env.ARGON2_TIME_COST,
      parallelism: env.ARGON2_PARALLELISM,
    });
    user = await prisma.user.create({
      data: { name, email, passwordHash, status: "ACTIVE" },
      select: { id: true },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { name },
      select: { id: true },
    });
  }
  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: user.id, roleId: roleByCode.get("SUPERADMIN")! },
    },
    create: { userId: user.id, roleId: roleByCode.get("SUPERADMIN")! },
    update: {},
    select: { userId: true },
  });
  process.stdout.write(
    "Seed completed: roles, permissions and Superadmin are ready.\n",
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Seed failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
