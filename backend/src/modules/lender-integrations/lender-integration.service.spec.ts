import { Prisma } from '@prisma/client';
import { LenderAdapterRegistry } from './lender-adapter.registry';
import { MockLenderAAdapter } from './adapters/mock-lender-a.adapter';
import { MockLenderBAdapter } from './adapters/mock-lender-b.adapter';
import { LenderIntegrationService } from './lender-integration.service';

const configFor = (adapterKey: string) => ({
  id: `CONFIG-${adapterKey}`, lenderId: adapterKey.endsWith('A_V1') ? 'LENDER-A' : 'LENDER-B', adapterKey, adapterVersion: '1',
  isActive: true, baseUrl: null, authType: 'NONE', credentialSecretReference: null, createApplicationPath: null,
  updateApplicationPath: null, decisionPath: null, statusPath: null, connectTimeoutMs: 5000, requestTimeoutMs: 15000,
});

const applicationFor = (config: any) => ({
  id: 1n, customerId: 10n, applicationNumber: 'APP-001', status: 'ASSESSMENT_FEE_PAID', platformProductId: 'PLATFORM-1',
  requestedAmount: null, scopeCode: 'PLATFORM_DEFAULT', mlmAllocationDecisionId: 'DEC-1', lenderId: config.lenderId,
  lenderProductId: 'PRODUCT-1', productStrategyVersionId: 'PSV-1', allocatedAt: new Date('2026-08-01T00:00:00Z'),
  assessmentFeeBaseAmount: new Prisma.Decimal('500'), assessmentFeeGstRate: new Prisma.Decimal('18'),
  assessmentFeeGstAmount: new Prisma.Decimal('90'), assessmentFeeTotalAmount: new Prisma.Decimal('590'), assessmentFeeCurrency: 'INR',
  customer: { fullName: 'Test Customer', firstName: 'Test', middleName: null, lastName: 'Customer', mobileNumber: '9999999999', email: 'test@example.test', dateOfBirth: new Date('1990-01-01'), gender: 'MALE', panNumber: 'ABCDE1234F', panVerified: true },
  lenderApplicationLink: { id: 'LINK-1', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId, lenderProductId: 'PRODUCT-1', productStrategyVersionId: 'PSV-1', integrationConfigId: config.id, adapterKey: config.adapterKey, adapterVersion: '1', createStatus: 'PENDING', integrationConfig: config },
});

describe('LenderIntegrationService selected-lender dispatch', () => {
  it.each([
    ['MOCK_LENDER_A_V1', 'LEAD_CREATED'],
    ['MOCK_LENDER_B_V1', 'APPLICATION_REGISTERED'],
  ])('uses only persisted adapter %s', async (adapterKey, expectedStatus) => {
    const config = configFor(adapterKey);
    const application = applicationFor(config);
    const mockA = new MockLenderAAdapter();
    const mockB = new MockLenderBAdapter();
    const spyA = jest.spyOn(mockA, 'createApplication');
    const spyB = jest.spyOn(mockB, 'createApplication');
    const prisma: any = {
      lenderIntegrationOutbox: { findUnique: jest.fn().mockResolvedValue({ id: 'EVENT-1', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'CREATE', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_CREATE_APPLICATION:V1', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId }) },
      plApplication: { findUnique: jest.fn().mockResolvedValue(application) },
      mlmAllocationDecision: { findUnique: jest.fn().mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' }) },
      lenderProduct: { findUnique: jest.fn().mockResolvedValue({ id: 'PRODUCT-1', lenderId: config.lenderId, code: 'EXTERNAL-PL' }) },
      plPaymentLink: { findFirst: jest.fn().mockResolvedValue({ txnid: 'PAY-1', easebuzzId: 'EZ-1', paidAt: new Date('2026-08-01T01:00:00Z') }) },
      lenderDataSharingConsent: { findFirst: jest.fn().mockResolvedValue({ consentVersion: '1.0', consentTextHash: 'a'.repeat(64), consentReference: 'CONSENT', acceptedAt: new Date('2026-08-01T00:30:00Z'), ipAddress: null, userAgent: null, lenderId: config.lenderId }) },
      lenderApplicationLink: { update: jest.fn().mockImplementation(({ data }: any) => ({ ...application.lenderApplicationLink, ...data })) },
    };
    const outbox = { enqueueUpdateWhenReady: jest.fn(), enqueueDecisionWhenReady: jest.fn() } as any;
    const decisions = { process: jest.fn() } as any;
    await new LenderIntegrationService(prisma, new LenderAdapterRegistry([mockA, mockB]), outbox, decisions).processEvent('EVENT-1', 'LOCK-1');
    const selectedSpy = adapterKey === 'MOCK_LENDER_A_V1' ? spyA : spyB;
    const otherSpy = adapterKey === 'MOCK_LENDER_A_V1' ? spyB : spyA;
    expect(selectedSpy).toHaveBeenCalledTimes(1);
    expect(otherSpy).not.toHaveBeenCalled();
    expect(prisma.lenderApplicationLink.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastResponseStatus: expectedStatus }) }));
  });
});
