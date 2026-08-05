const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const summary = {};

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');

    const del = async (label, fn) => {
      const result = await fn();
      summary[label] = result.count;
    };

    // Loan-tree tables
    await del('plRepaymentAllocation', () => tx.plRepaymentAllocation.deleteMany({}));
    await del('plRepayment', () => tx.plRepayment.deleteMany({}));
    await del('plRepaymentSchedule', () => tx.plRepaymentSchedule.deleteMany({}));
    await del('plLoanCharge', () => tx.plLoanCharge.deleteMany({}));
    await del('plElectronicSignTransaction', () => tx.plElectronicSignTransaction.deleteMany({}));
    await del('plBankVerification', () => tx.plBankVerification.deleteMany({}));
    await del('plLoanAuditEvent', () => tx.plLoanAuditEvent.deleteMany({}));
    await del('plLoanMandate', () => tx.plLoanMandate.deleteMany({}));
    await del('plLoan', () => tx.plLoan.deleteMany({}));

    // MLM allocation decisions tied to applications
    await del('mlmAllocationAttempt', () => tx.mlmAllocationAttempt.deleteMany({}));
    await del('mlmAllocationDecision', () => tx.mlmAllocationDecision.deleteMany({}));

    // Application-tree tables
    await del('lenderDocumentTransfer', () => tx.lenderDocumentTransfer.deleteMany({}));
    await del('applicationLiveness', () => tx.applicationLiveness.deleteMany({}));
    await del('applicationAddress', () => tx.applicationAddress.deleteMany({}));
    await del('applicationKycSnapshot', () => tx.applicationKycSnapshot.deleteMany({}));
    await del('applicationEmploymentSnapshot', () => tx.applicationEmploymentSnapshot.deleteMany({}));
    await del('lenderIntegrationOutbox', () => tx.lenderIntegrationOutbox.deleteMany({}));
    await del('lenderApplicationLink', () => tx.lenderApplicationLink.deleteMany({}));
    await del('applicationStageConsent', () => tx.applicationStageConsent.deleteMany({}));
    await del('lenderDataSharingConsent', () => tx.lenderDataSharingConsent.deleteMany({}));
    await del('plCustomerDocument', () => tx.plCustomerDocument.deleteMany({}));
    await del('plPaymentLink', () => tx.plPaymentLink.deleteMany({}));
    await del('plApplication', () => tx.plApplication.deleteMany({}));

    // Customer-tree tables
    await del('kycVerificationStatus', () => tx.kycVerificationStatus.deleteMany({}));
    await del('customerRefreshToken', () => tx.customerRefreshToken.deleteMany({}));
    await del('customerSession', () => tx.customerSession.deleteMany({}));
    await del('otpSession(customer-linked)', () => tx.otpSession.deleteMany({ where: { customerId: { not: null } } }));
    await del('customer', () => tx.customer.deleteMany({}));

    // Reset MLM allocation counters derived from the deleted applications
    await del('mlmCapacityUsage', () => tx.mlmCapacityUsage.deleteMany({}));
    const routeStateReset = await tx.mlmAllocationRouteState.updateMany({
      data: { currentWeight: 0, allocatedApplicationCount: 0, allocatedAmount: 0, lastAllocatedAt: null },
    });
    summary['mlmAllocationRouteState(reset)'] = routeStateReset.count;

    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  });

  console.log('Wipe complete. Rows affected per table:');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
