require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const apiKey = process.env.FINTREE_API_KEY;
  if (!apiKey) {
    throw new Error('FINTREE_API_KEY is missing from .env');
  }

  // Find a real application that actually has a customer record
  let app = null;
  const applications = await prisma.plApplication.findMany({
    where: { lenderId: 'cms62saaa0001tsmcksp92trc' },
    include: { customer: true },
    take: 10
  }).catch(() => []); // If Prisma throws on include for bad data, we'll try another way

  if (applications && applications.length > 0) {
    app = applications.find(a => a.customer);
  }

  // Fallback: If DB data is corrupted, let's just find ANY customer and ANY application
  if (!app) {
    const backupCustomer = await prisma.customer.findFirst();
    const backupApp = await prisma.plApplication.findFirst({ where: { lenderId: 'cms62saaa0001tsmcksp92trc' }});
    if (backupCustomer && backupApp) {
       app = backupApp;
       app.customer = backupCustomer;
    }
  }

  if (!app || !app.customer) {
    console.log('No valid application/customer combo found in DB. Please create one in the UI first.');
    return;
  }

  const payload = {
    externalApplicationReference: app.applicationNumber || 'APP-UNKNOWN',
    lan: app.platformLan || 'LAN-UNKNOWN',
    sourceSystem: 'FINTREE_PLP',
    productCode: 'PL-STANDARD', // using standard fallback for test
    customer: {
      fullName: app.customer.fullName || 'Test User',
      firstName: app.customer.firstName || 'Test',
      lastName: app.customer.lastName || 'User',
      fatherName: app.customer.fatherName || 'Father',
      panNumber: app.customer.panNumber || 'ABCDE1234F',
      dateOfBirth: app.customer.dateOfBirth ? new Date(app.customer.dateOfBirth).toISOString().split('T')[0] : '1990-01-01',
      gender: app.customer.gender || 'MALE',
      mobileNumber: app.customer.mobileNumber || '9999999999',
      email: app.customer.email || 'test@example.com'
    },
    panVerification: {
      verified: true,
      providerReference: app.customer.panProviderReference || 'PROVIDER-REF',
      verifiedAt: app.customer.panVerifiedAt ? new Date(app.customer.panVerifiedAt).toISOString() : new Date().toISOString()
    }
  };

  console.log('--- Real Payload from DB ---');
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await fetch('https://uat.fintreelms.com/api/partner/v1/application', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'X-Correlation-Id': require('crypto').randomUUID(),
        'Idempotency-Key': require('crypto').randomUUID()
      },
      body: JSON.stringify(payload)
    });
    
    console.log('\n--- Fintree Response ---');
    console.log('Status Code:', response.status);
    const data = await response.text();
    console.log('Response Body:', data);
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
