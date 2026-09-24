const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const customer = await prisma.customer.findUnique({
    where: { id: 53n },
  });
  console.log('Customer 53:', customer ? {
    id: customer.id.toString(),
    lan: customer.lan,
    onboardingStatus: customer.onboardingStatus,
    mobileNumber: customer.mobileNumber,
    panNumber: customer.panNumber,
    employmentType: customer.employmentType,
    aadhaarKycStatus: customer.aadhaarKycStatus,
    aadhaarVerified: customer.aadhaarVerified,
  } : 'NOT FOUND');

  const app = await prisma.plApplication.findFirst({
    where: { customerId: 53n },
    orderBy: { id: 'desc' },
  });
  console.log('Latest plApplication:', app ? {
    id: app.id.toString(),
    applicationReference: app.applicationReference,
    status: app.status,
    lenderId: app.lenderId?.toString(),
  } : 'NONE');

  const aaRequests = await prisma.customerAccountAggregatorRequest.findMany({
    where: { customerId: 53n },
    orderBy: { id: 'desc' },
    take: 3,
  });
  console.log('AA Requests:', aaRequests.map(r => ({
    id: r.id.toString(),
    applicationId: r.applicationId?.toString(),
    status: r.status,
    consentStatus: r.consentStatus,
    dataStatus: r.dataStatus,
  })));

  const payments = await prisma.plPayment.findMany({
    where: { customerId: 53n },
    orderBy: { id: 'desc' },
    take: 2,
  });
  console.log('Payments:', payments.map(p => ({
    id: p.id.toString(),
    status: p.status,
  })));

  const addresses = await prisma.applicationAddress.findMany({
    where: { applicationId: app?.id },
  });
  console.log('Addresses:', addresses.map(a => a.addressType));
}

check().catch(console.error).finally(() => prisma.$disconnect());
