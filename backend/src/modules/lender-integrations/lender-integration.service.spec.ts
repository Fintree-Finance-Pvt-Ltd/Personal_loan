import { Prisma } from '@prisma/client';
import { LenderAdapterRegistry } from './lender-adapter.registry';
import { LenderIntegrationService } from './lender-integration.service';
import { LenderIntegrationError } from './lender-integration.errors';
import { FintreeFinanceV1Adapter } from './adapters/fintree-finance-v1.adapter';

const configFor = (adapterKey: string) => ({
  id: `CONFIG-${adapterKey}`, lenderId: 'LENDER-A', adapterKey, adapterVersion: '1',
  isActive: true, baseUrl: null, authType: 'NONE', credentialSecretReference: null, createApplicationPath: null,
  updateApplicationPath: null, decisionPath: null, statusPath: null, connectTimeoutMs: 5000, requestTimeoutMs: 15000,
  clientId: 'test-client', consentPath: '/consent'
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

describe('LenderIntegrationService explicit requirements', () => {
  let adapter: any;
  let registry: LenderAdapterRegistry;
  let outbox: any;
  let decisions: any;
  let prisma: any;
  let service: LenderIntegrationService;

  beforeEach(() => {
    adapter = {
      adapterKey: 'FINTREE_FINANCE_V1',
      adapterVersion: '1',
      createApplication: jest.fn(),
      submitConsent: jest.fn(),
      updateApplication: jest.fn(),
      requestDecision: jest.fn(),
      getStatus: jest.fn(),
    };
    registry = new LenderAdapterRegistry([adapter]);
    outbox = { enqueueUpdateWhenReady: jest.fn(), enqueueDecisionWhenReady: jest.fn() };
    decisions = { process: jest.fn() };
    prisma = {
      $transaction: jest.fn((fn) => fn(prisma)),
      lenderIntegrationOutbox: { 
        findUnique: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      plApplication: { findUnique: jest.fn() },
      mlmAllocationDecision: { findUnique: jest.fn() },
      lenderProduct: { findUnique: jest.fn() },
      plPaymentLink: { findFirst: jest.fn() },
      lenderDataSharingConsent: { findFirst: jest.fn() },
      lenderApplicationLink: { update: jest.fn() },
    };
    service = new LenderIntegrationService(prisma, registry, outbox, decisions);
  });

  it('CREATE success atomically stores partnerApplicationId and enqueues one CONSENT event', async () => {
    const config = configFor('FINTREE_FINANCE_V1');
    const application = applicationFor(config);
    prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-1', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'CREATE', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_CREATE_APPLICATION:V1', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId });
    prisma.plApplication.findUnique.mockResolvedValue(application);
    prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });
    prisma.lenderProduct.findUnique.mockResolvedValue({ id: 'PRODUCT-1', lenderId: config.lenderId, code: 'EXTERNAL-PL' });
    prisma.plPaymentLink.findFirst.mockResolvedValue({ txnid: 'PAY-1', easebuzzId: 'EZ-1', paidAt: new Date('2026-08-01T01:00:00Z') });
    prisma.lenderDataSharingConsent.findFirst.mockResolvedValue({ consentVersion: '1.0', consentTextHash: 'a'.repeat(64), consentReference: 'CONSENT', acceptedAt: new Date('2026-08-01T00:30:00Z'), ipAddress: null, userAgent: null, lenderId: config.lenderId });

    adapter.createApplication.mockResolvedValue({ acknowledged: true, providerStatus: 'ACKNOWLEDGED', partnerApplicationId: 'PARTNER-1' });

    await service.processEvent('EVENT-1', 'LOCK-1');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.lenderApplicationLink.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createStatus: 'COMPLETED', partnerApplicationId: 'PARTNER-1' })
    }));
    expect(prisma.lenderIntegrationOutbox.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'APP-001:LENDER_SUBMIT_CONSENT:V1' },
      create: expect.objectContaining({ integrationStage: 'CONSENT' })
    }));
  });

  it('existing partnerApplicationId blocks duplicate CREATE', async () => {
    const config = configFor('FINTREE_FINANCE_V1');
    const application = applicationFor(config) as any;
    application.lenderApplicationLink.createStatus = 'COMPLETED'; // Already created

    prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-1', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'CREATE', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_CREATE_APPLICATION:V1', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId });
    prisma.plApplication.findUnique.mockResolvedValue(application);
    prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });

    await service.processEvent('EVENT-1', 'LOCK-1');

    expect(adapter.createApplication).not.toHaveBeenCalled(); // Fast return
  });

  it('consent failure does not repeat CREATE', async () => {
    const config = configFor('FINTREE_FINANCE_V1');
    const application = applicationFor(config) as any;
    application.lenderApplicationLink.createStatus = 'COMPLETED';
    application.lenderApplicationLink.partnerApplicationId = 'PARTNER-1';

    prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-1', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'CONSENT', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_SUBMIT_CONSENT:V1', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId });
    prisma.plApplication.findUnique.mockResolvedValue(application);
    prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });
    prisma.lenderDataSharingConsent.findFirst.mockResolvedValue({ consentVersion: '1.0', consentTextHash: 'a'.repeat(64), consentReference: 'CONSENT', acceptedAt: new Date('2026-08-01T00:30:00Z'), ipAddress: null, userAgent: null, lenderId: config.lenderId });

    adapter.submitConsent.mockResolvedValue({ acknowledged: false, providerStatus: 'FAILED' }); // Consent fails

    await expect(service.processEvent('EVENT-1', 'LOCK-1')).rejects.toThrow(LenderIntegrationError);
    expect(adapter.createApplication).not.toHaveBeenCalled(); // CREATE is not repeated
  });

  it('duplicate consent scheduling creates one logical event', async () => {
    const config = configFor('FINTREE_FINANCE_V1');
    const application = applicationFor(config);
    
    // Simulate CREATE being processed
    prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-1', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'CREATE', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_CREATE_APPLICATION:V1', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId });
    prisma.plApplication.findUnique.mockResolvedValue(application);
    prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });
    prisma.lenderProduct.findUnique.mockResolvedValue({ id: 'PRODUCT-1', lenderId: config.lenderId, code: 'EXTERNAL-PL' });
    prisma.plPaymentLink.findFirst.mockResolvedValue({ txnid: 'PAY-1', easebuzzId: 'EZ-1', paidAt: new Date('2026-08-01T01:00:00Z') });
    prisma.lenderDataSharingConsent.findFirst.mockResolvedValue({ consentVersion: '1.0', consentTextHash: 'a'.repeat(64), consentReference: 'CONSENT', acceptedAt: new Date('2026-08-01T00:30:00Z'), ipAddress: null, userAgent: null, lenderId: config.lenderId });

    adapter.createApplication.mockResolvedValue({ acknowledged: true, providerStatus: 'ACKNOWLEDGED', partnerApplicationId: 'PARTNER-1' });

    await service.processEvent('EVENT-1', 'LOCK-1');

    // Due to idempotencyKey on the outbox UPSERT, duplicate scheduling is blocked at DB level
    expect(prisma.lenderIntegrationOutbox.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'APP-001:LENDER_SUBMIT_CONSENT:V1' },
      create: expect.any(Object),
      update: {} // Doesn't override existing logic
    }));
  });

  it('PENDING invokes getStatus only', async () => {
    const config = configFor('FINTREE_FINANCE_V1');
    const application = applicationFor(config) as any;
    application.lenderApplicationLink.updateStatus = 'COMPLETED';
    application.lenderApplicationLink.partnerApplicationId = 'PARTNER-1';

    prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-1', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'STATUS', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_STATUS_CHECK:V1', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId });
    prisma.plApplication.findUnique.mockResolvedValue(application);
    prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });

    adapter.getStatus.mockResolvedValue({ decision: 'PENDING', providerStatus: 'PENDING' });

    await service.processEvent('EVENT-1', 'LOCK-1');

    expect(adapter.getStatus).toHaveBeenCalled();
    expect(adapter.requestDecision).not.toHaveBeenCalled();
    expect(decisions.process).toHaveBeenCalled();
  });
});
