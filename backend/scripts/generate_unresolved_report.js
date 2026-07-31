const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  const applications = await prisma.plApplication.findMany({
    where: { platformProductId: null },
    select: { id: true, applicationNumber: true, status: true, customerId: true, createdAt: true },
  });

  if (applications.length === 0) {
    console.log("No unresolved applications found.");
    return;
  }

  const reportData = applications.map(app => ({
    ApplicationID: app.id.toString(),
    ApplicationNumber: app.applicationNumber,
    Status: app.status,
    CustomerID: app.customerId.toString(),
    CreatedAt: app.createdAt.toISOString(),
    Reason: "Missing platformProductId",
  }));

  const reportPath = 'unresolved_applications_report.json';
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`Generated report with ${applications.length} unresolved applications at ${reportPath}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
