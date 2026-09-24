const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const customerId = 53n;
  const applicationId = 44n;

  // 1. Update customer onboardingStatus to PLATFORM_ELIGIBLE
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      onboardingStatus: 'PLATFORM_ELIGIBLE',
    },
  });

  // 2. Update plApplication 44 status to ASSESSMENT_FEE_PAID
  await prisma.plApplication.update({
    where: { id: applicationId },
    data: {
      status: 'ASSESSMENT_FEE_PAID',
    },
  });

  // 3. Update all customerAccountAggregatorRequest records for this customer to FAILED / REJECTED
  // so aaCompleted is false AND status in AccountAggregatorStep is 'FAILED' with consentStatus: 'REJECTED'
  const updatedReqs = await prisma.customerAccountAggregatorRequest.updateMany({
    where: { customerId, applicationId },
    data: {
      status: 'FAILED',
      consentStatus: 'REJECTED',
      dataStatus: 'FAILED',
      failureReason: 'Account Aggregator consent was rejected. Please upload your bank statement PDF below.',
    },
  });
  console.log(`Updated ${updatedReqs.count} AA request records to FAILED.`);

  // 4. Verify
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });
  const app = await prisma.plApplication.findUnique({
    where: { id: applicationId },
  });
  const latestAa = await prisma.customerAccountAggregatorRequest.findFirst({
    where: { customerId, applicationId },
    orderBy: { id: 'desc' },
  });

  console.log('Verification:');
  console.log('Customer 53 onboardingStatus:', customer.onboardingStatus);
  console.log('Application 44 status:', app.status);
  console.log('Latest AA Request:', {
    id: latestAa?.id.toString(),
    status: latestAa?.status,
    consentStatus: latestAa?.consentStatus,
    dataStatus: latestAa?.dataStatus,
    failureReason: latestAa?.failureReason,
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
