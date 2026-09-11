import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const authorized = await prisma.plLoanMandate.findMany({
    where: { status: 'AUTHORIZED' },
    select: { id: true, loanId: true, applicationId: true, lan: true, provider: true, mandateType: true, umrn: true, providerMandateId: true, authorizedAt: true },
    orderBy: { id: 'desc' },
    take: 15,
  });
  console.log('Recent AUTHORIZED mandates - umrn populated?:', JSON.stringify(authorized, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

  const totalAuthorized = await prisma.plLoanMandate.count({ where: { status: 'AUTHORIZED' } });
  const withUmrn = await prisma.plLoanMandate.count({ where: { status: 'AUTHORIZED', umrn: { not: null } } });
  const withoutUmrn = await prisma.plLoanMandate.count({ where: { status: 'AUTHORIZED', umrn: null } });
  console.log({ totalAuthorized, withUmrn, withoutUmrn });

  // Check LenderApplicationLink.updatePayloadVersion for these applications - did V4 (mandate stage) ever get sent?
  const links = await prisma.lenderApplicationLink.findMany({
    where: { updatePayloadVersion: { gte: 4 } },
    select: { applicationId: true, updateStatus: true, updatePayloadVersion: true, lastSyncedStage: true },
    take: 10,
  });
  console.log('Links that reached updatePayloadVersion >= 4:', JSON.stringify(links, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}
main().catch((e) => console.error('ERROR', e)).finally(() => prisma.$disconnect());
