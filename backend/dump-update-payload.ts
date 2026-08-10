import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { LenderIntegrationOutboxService } from './src/modules/lender-integrations/lender-integration-outbox.service';
import { PrismaService } from './src/infrastructure/prisma/prisma.service';
import { mapFintreeDetailsPayload } from './src/modules/lender-integrations/adapters/fintree-finance-v1/fintree-finance-v1.mapper';
import { randomUUID } from 'crypto';

async function main() {
  const applicationId = BigInt(process.argv[2] || '42');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const outbox = app.get(LenderIntegrationOutboxService);
    const prisma = app.get(PrismaService);

    const readiness = await outbox.getUpdateReadiness(applicationId);
    if (!readiness.ready) {
      console.log('NOT READY. Reasons:', readiness.reasons);
      return;
    }

    const canonical = readiness.application as any;
    const customer = canonical.customer;
    const employment = canonical.employmentSnapshot;
    const kyc = canonical.kycSnapshot;
    const liveness = canonical.liveness;
    const photo = liveness.photoDocument;
    const permanent = readiness.permanent as any;
    const current = readiness.current as any;

    const link = await prisma.lenderApplicationLink.findUnique({ where: { applicationId } });
    const outboxEvent = await prisma.lenderIntegrationOutbox.findFirst({
      where: { applicationId, integrationStage: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
    });

    const mapAddress = (address: any) => ({
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      landmark: address.landmark,
      locality: address.locality,
      district: address.district,
      city: address.city,
      state: address.state,
      country: address.country,
      pincode: address.pincode,
      source: address.source,
    });

    const context = {
      idempotencyKey: outboxEvent?.idempotencyKey || 'DEBUG-DUMP',
      correlationId: randomUUID(),
      payloadVersion: outboxEvent?.payloadVersion || 1,
      partnerApplicationId: link?.partnerApplicationId,
      applicationReference: canonical.applicationNumber,
      platformLan: canonical.platformLan,
      customer: {
        fullName: customer.fullName,
        firstName: customer.firstName,
        middleName: customer.middleName,
        lastName: customer.lastName,
        fatherName: customer.fatherName,
        panNumber: customer.panNumber,
        dateOfBirth: customer.dateOfBirth ? customer.dateOfBirth.toISOString().slice(0, 10) : null,
        gender: customer.gender,
        mobileNumber: customer.mobileNumber,
        email: customer.email,
      },
      employment: {
        employmentType: employment.employmentType,
        companyType: employment.companyType,
        companyName: employment.companyName,
        designation: employment.designation,
        businessName: employment.businessName,
        businessConstitution: employment.businessConstitution,
        monthlyIncome: employment.monthlyIncome?.toString(),
        annualTurnover: employment.annualTurnover?.toString() ?? null,
        employmentVintage: employment.employmentVintage,
        businessVintage: employment.businessVintage,
        salaryMode: employment.salaryMode,
        completedAt: employment.completedAt?.toISOString(),
      },
      aadhaarKyc: {
        status: 'VERIFIED',
        maskedAadhaar: kyc.maskedAadhaar,
        verifiedName: kyc.verifiedName,
        dateOfBirth: kyc.verifiedDateOfBirth,
        gender: kyc.verifiedGender,
        provider: kyc.provider,
        providerReference: kyc.providerReference,
        verifiedAt: kyc.verifiedAt?.toISOString(),
      },
      liveness: {
        provider: liveness.provider,
        providerTransactionId: liveness.providerTransactionId,
        status: 'VERIFIED',
        score: liveness.score?.toString() ?? null,
        photoDocumentReference: photo ? String(photo.id) : null,
        evidenceReference: liveness.evidenceReference,
        latitude: liveness.latitude?.toString() ?? null,
        longitude: liveness.longitude?.toString() ?? null,
        capturedAt: liveness.capturedAt?.toISOString(),
        verifiedAt: liveness.verifiedAt?.toISOString(),
      },
      address: {
        permanent: mapAddress(permanent),
        current: mapAddress(current),
        currentAddressSameAsPermanent: current.sameAsPermanent,
      },
    };

    const payload = mapFintreeDetailsPayload(context as any);
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
