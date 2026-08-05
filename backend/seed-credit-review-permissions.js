const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const newPermissions = [
  ['CREDIT_APPROVE', 'CREDIT'],
  ['CREDIT_REJECT', 'CREDIT'],
];

async function main() {
  for (const [code, module] of newPermissions) {
    await prisma.permission.upsert({
      where: { code },
      create: { code, module, description: `${code.replaceAll('_', ' ').toLowerCase()} permission` },
      update: { module },
    });
    console.log(`Upserted permission ${code}`);
  }

  const role = await prisma.role.findUnique({ where: { code: 'CREDIT_CHECKER' } });
  if (!role) throw new Error('CREDIT_CHECKER role not found.');

  const permissionRows = await prisma.permission.findMany({ where: { code: { in: newPermissions.map(([code]) => code) } } });

  const result = await prisma.rolePermission.createMany({
    data: permissionRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  console.log(`Linked ${result.count} new role-permission row(s) to CREDIT_CHECKER.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
