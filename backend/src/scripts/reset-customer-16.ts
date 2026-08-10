import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const customerId = 16n;
  console.log(`Finding loans for customerId = ${customerId}...`);

  const loans = await prisma.plLoan.findMany({
    where: { customerId },
  });

  if (loans.length === 0) {
    console.log(`No loans found for customerId = ${customerId}`);
    return;
  }

  console.log(`Found ${loans.length} loan(s) for customerId = ${customerId}:`);
  for (const l of loans) {
    console.log(` - Loan ID: ${l.id}, LAN: ${l.lan}, Status: ${l.status}, DisbursalStatus: ${l.disbursalStatus}`);
  }

  const loanIds = loans.map((l) => l.id);
  const lans = loans.map((l) => l.lan);

  // 1. Delete Repayment Allocations
  const allocDel = await prisma.plRepaymentAllocation.deleteMany({
    where: { loanId: { in: loanIds } },
  });
  console.log(`Deleted ${allocDel.count} PlRepaymentAllocation row(s).`);

  // 2. Delete Repayments
  const repDel = await prisma.plRepayment.deleteMany({
    where: { loanId: { in: loanIds } },
  });
  console.log(`Deleted ${repDel.count} PlRepayment row(s).`);

  // 3. Delete Repayment Schedules
  const rpsDel = await prisma.plRepaymentSchedule.deleteMany({
    where: { loanId: { in: loanIds } },
  });
  console.log(`Deleted ${rpsDel.count} PlRepaymentSchedule row(s).`);

  // 4. Delete Charges (if model exists)
  try {
    const chgDel = await (prisma as any).plLoanCharge.deleteMany({
      where: { loanId: { in: loanIds } },
    });
    console.log(`Deleted ${chgDel.count} PlLoanCharge row(s).`);
  } catch (e) {
    console.log('No PlLoanCharge table or zero rows deleted.');
  }

  // 5. Delete Disbursal Webhook Events for these LANs
  const webhookDel = await prisma.disbursalWebhookEvent.deleteMany({
    where: { lan: { in: lans } },
  });
  console.log(`Deleted ${webhookDel.count} DisbursalWebhookEvent row(s).`);

  // 6. Reset Loan Disbursal Fields so disbursal webhook can be re-triggered
  const updatedLoans = await prisma.plLoan.updateMany({
    where: { id: { in: loanIds } },
    data: {
      disbursalStatus: 'NOT_STARTED',
      status: 'READY_FOR_DISBURSAL',
      currentStep: 'READY_FOR_DISBURSAL',
      disbursalAmount: null,
      disbursalUtr: null,
      disbursalDate: null,
      firstRepaymentDate: null,
      disbursalCompletedAt: null,
    },
  });
  console.log(`Reset ${updatedLoans.count} loan(s) back to READY_FOR_DISBURSAL status.`);
  console.log('Customer 16 RPS and disbursal records cleaned up successfully!');
}

main()
  .catch((e) => {
    console.error('Error running script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
