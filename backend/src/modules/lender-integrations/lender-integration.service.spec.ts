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
  platformLan: 'FTPL00000001',
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
      capabilities: { separateConsentSubmission: true, detailsUpdate: true, documentUpload: true, decisionRequest: false, statusPolling: false },
    };
    registry = new LenderAdapterRegistry([adapter]);
    outbox = { enqueueUpdateWhenReady: jest.fn(), enqueueDecisionWhenReady: jest.fn() };
    decisions = { process: jest.fn() };
    let documentFiles = { loadDocument: jest.fn(), cleanupDocumentFile: jest.fn() };
    prisma = {
      $transaction: jest.fn((fn) => fn(prisma)),
      lenderIntegrationOutbox: { 
        findUnique: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      plApplication: { findUnique: jest.fn() },
      mlmAllocationDecision: { findUnique: jest.fn().mockResolvedValue({ lenderId: 'LENDER-A', externalProductCode: 'PRODUCT-1' }) },
      lenderProduct: { findUnique: jest.fn() },
      lenderProductVersion: { findUnique: jest.fn().mockResolvedValue(null) },
      plPaymentLink: { findFirst: jest.fn() },
      plBankVerification: { findFirst: jest.fn().mockResolvedValue(null) },
      plLoanMandate: { findFirst: jest.fn().mockResolvedValue(null) },
      lenderDataSharingConsent: { findFirst: jest.fn().mockResolvedValue({ id: 'CONS-1', consentText: 'Test Consent', consentTextHash: 'hash123' }) },
      lenderApplicationLink: { update: jest.fn() },
      plLoan: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    service = new LenderIntegrationService(prisma, registry, outbox, decisions, documentFiles as any);
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
    application.lenderApplicationLink.partnerApplicationId = 'PARTNER-1';

    prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-1', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'CREATE', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_CREATE_APPLICATION:V1', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId });
    prisma.plApplication.findUnique.mockResolvedValue(application);
    prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', externalProductCode: 'PRODUCT-1', productVersionId: 'PSV-1' });
    prisma.lenderProduct.findUnique.mockResolvedValue({ id: 'PRODUCT-1', lenderId: config.lenderId, code: 'EXTERNAL-PL' });
    prisma.plPaymentLink.findFirst.mockResolvedValue({ txnid: 'PAY-1', easebuzzId: 'EZ-1', paidAt: new Date() });

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
    prisma.lenderDataSharingConsent.findFirst.mockResolvedValue({ consentVersion: '1.0', consentText: 'Test Consent', consentTextHash: 'a'.repeat(64), consentReference: 'CONSENT', acceptedAt: new Date('2026-08-01T00:30:00Z'), ipAddress: null, userAgent: null, lenderId: config.lenderId });

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

  it('UPDATE completes successfully and explicitly enqueues DOCUMENT transfers for Aadhaar XML/PDF', async () => {
    const config = configFor('FINTREE_FINANCE_V1');
    const application = applicationFor(config);
    const link = application.lenderApplicationLink;
    link.createStatus = 'ACKNOWLEDGED';
    (link as any).consentStatus = 'COMPLETED';
    (link as any).partnerApplicationId = 'PARTNER-1';

      prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-2', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'UPDATE', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_UPDATE_APPLICATION:V1', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId });
      prisma.plApplication.findUnique.mockResolvedValue(application);
      prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });
      prisma.applicationEmploymentSnapshot = { findUnique: jest.fn().mockResolvedValue({ employmentType: 'SALARIED', companyName: 'ACME', designation: 'Engineer', monthlyIncome: 50000, completedAt: new Date() }) };
      prisma.applicationKycSnapshot = { findUnique: jest.fn().mockResolvedValue({ provider: 'DIGILOCKER', providerReference: '1234', verificationStatus: 'VERIFIED', verifiedAt: new Date(), verifiedName: 'Test', maskedAadhaar: 'XXXX-1234', verifiedDateOfBirth: '1990-01-01', verifiedGender: 'MALE' }) };
      prisma.applicationAddress = { findFirst: jest.fn().mockResolvedValue({ addressType: 'PERMANENT' }) };
      prisma.applicationLiveness = { findUnique: jest.fn().mockResolvedValue({ verificationStatus: 'VERIFIED', verifiedAt: new Date(), photoDocument: { id: 9n } }) };
    
      outbox.getUpdateReadiness = jest.fn().mockResolvedValue({
        ready: true,
        application: {
          ...application,
          employmentSnapshot: { employmentType: 'SALARIED', companyName: 'ACME', designation: 'Engineer', monthlyIncome: 50000, completedAt: new Date() },
          kycSnapshot: { provider: 'DIGILOCKER', verificationStatus: 'VERIFIED', verifiedAt: new Date(), verifiedName: 'Test', maskedAadhaar: 'XXXX-1234', verifiedDateOfBirth: '1990-01-01', verifiedGender: 'MALE' },
          liveness: { verificationStatus: 'VERIFIED', verifiedAt: new Date(), photoDocument: { id: 9n, capturedAt: new Date() } },
          stageConsents: [{ consentType: 'DATA_SHARING', consentTextHash: 'a', revokedAt: null, acceptedAt: new Date() }]
        },
        permanent: { addressType: 'PERMANENT' },
        current: { addressType: 'CURRENT', sameAsPermanent: true }
      });

    adapter.updateApplication.mockResolvedValue({ acknowledged: true, providerStatus: 'ACKNOWLEDGED' });
    adapter.capabilities = { documentUpload: true };
    adapter.selectDocuments = jest.fn().mockImplementation((candidates: any[]) => candidates
      .filter((c) => c.sourceDocumentType === 'AADHAAR_XML' || c.sourceDocumentType === 'AADHAAR_PDF')
      .map((c) => ({ sourceDocumentId: c.sourceDocumentId, documentType: c.sourceDocumentType })));

      // mock documents
      prisma.plCustomerDocument = { findMany: jest.fn().mockResolvedValue([
        { id: 101n, applicationId: 1n, documentType: 'AADHAAR_XML', uploadedAt: new Date(), status: 'VERIFIED', applicantType: 'BORROWER' },
        { id: 102n, applicationId: 1n, documentType: 'AADHAAR_PDF', uploadedAt: new Date(), status: 'VERIFIED', applicantType: 'BORROWER' },
        { id: 103n, applicationId: 1n, documentType: 'BANK_STATEMENT', uploadedAt: new Date(), status: 'VERIFIED', applicantType: 'BORROWER' }
      ])};
    
    prisma.lenderDocumentTransfer = { upsert: jest.fn().mockImplementation(({ create }: any) => ({ ...create, id: 200n })) };

    await service.processEvent('EVENT-2', 'LOCK-1');

    expect(prisma.lenderApplicationLink.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ updateStatus: 'COMPLETED' })
    }));
    
    // Verify only Aadhaar XML/PDF were queued
    expect(prisma.lenderDocumentTransfer.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.lenderIntegrationOutbox.upsert).toHaveBeenCalledTimes(2);
    
    // Check missing Aadhaar XML/PDF does not fail
    prisma.plCustomerDocument.findMany.mockResolvedValue([]);
    prisma.lenderDocumentTransfer.upsert.mockClear();
    prisma.lenderIntegrationOutbox.upsert.mockClear();
    
    await service.processEvent('EVENT-2', 'LOCK-1');
    expect(prisma.lenderDocumentTransfer.upsert).toHaveBeenCalledTimes(0);
    expect(prisma.lenderIntegrationOutbox.upsert).toHaveBeenCalledTimes(0);
  });

  it('auto-triggers the decision request after the first UPDATE completes, even though decisionPayloadVersion defaults to 1 in the DB before any decision has ever been requested', async () => {
    const config = configFor('FINTREE_FINANCE_V1');
    const application = applicationFor(config);
    const link = application.lenderApplicationLink;
    link.createStatus = 'ACKNOWLEDGED';
    (link as any).consentStatus = 'COMPLETED';
    (link as any).partnerApplicationId = 'PARTNER-1';
    // Matches the real Prisma schema default — decisionPayloadVersion is 1 and
    // decisionIdempotencyKey is null on a brand-new link, before any decision call
    // has ever actually been requested.
    (link as any).decisionPayloadVersion = 1;
    (link as any).decisionIdempotencyKey = null;

    prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-2', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'UPDATE', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_UPDATE_APPLICATION:V1', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId });
    prisma.plApplication.findUnique.mockResolvedValue(application);
    prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });

    outbox.getUpdateReadiness = jest.fn().mockResolvedValue({
      ready: true,
      application: {
        ...application,
        employmentSnapshot: { employmentType: 'SALARIED', companyName: 'ACME', designation: 'Engineer', monthlyIncome: 50000, completedAt: new Date() },
        kycSnapshot: { provider: 'DIGILOCKER', verificationStatus: 'VERIFIED', verifiedAt: new Date(), verifiedName: 'Test', maskedAadhaar: 'XXXX-1234', verifiedDateOfBirth: '1990-01-01', verifiedGender: 'MALE' },
        liveness: { verificationStatus: 'VERIFIED', verifiedAt: new Date(), photoDocument: { id: 9n, capturedAt: new Date() } },
        stageConsents: [{ consentType: 'DATA_SHARING', consentTextHash: 'a', revokedAt: null, acceptedAt: new Date() }],
      },
      permanent: { addressType: 'PERMANENT' },
      current: { addressType: 'CURRENT', sameAsPermanent: true },
    });

    adapter.updateApplication.mockResolvedValue({ acknowledged: true, providerStatus: 'ACKNOWLEDGED' });
    adapter.capabilities = { documentUpload: false, decisionRequest: true };
    prisma.plCustomerDocument = { findMany: jest.fn().mockResolvedValue([]) };

    await service.processEvent('EVENT-2', 'LOCK-1');

    expect(outbox.enqueueDecisionWhenReady).toHaveBeenCalledWith(1n, 1);
  });

  // Note: the 3.5 MB request cap (DOCUMENT_REQUEST_LIMIT) is only enforced deep inside
  // LenderHttpService as maxRequestBytes on the actual HTTP call — there is no pre-flight
  // size check in processDocument() that skips an oversized transfer early. This test
  // exercises the successful load/hash/upload path only; it does not (and currently cannot,
  // at this mocking level) verify oversized-file behavior.
  it('DOCUMENT loads file, calculates SHA256 and calls adapter.uploadDocument', async () => {
    const config = configFor('FINTREE_FINANCE_V1');
    const application = applicationFor(config);
    const link = application.lenderApplicationLink;
    link.createStatus = 'ACKNOWLEDGED';
    (link as any).partnerApplicationId = 'PARTNER-1';

    prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-3', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'DOCUMENT', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_DOCUMENT:AADHAAR_XML:101:V1', documentTransferId: '200', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId });
    prisma.plApplication.findUnique.mockResolvedValue(application);
    prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });
    
    adapter.uploadDocument = jest.fn().mockResolvedValue({ success: true, data: { status: 'ACKNOWLEDGED', partnerDocumentId: 'DOC-1', documentType: 'AADHAAR_XML', fileSha256: 'mocked-hash' } });
    adapter.capabilities = { documentUpload: true };

    const mockDocument = { id: 101n, applicationId: 1n, customerId: 10n, documentType: 'AADHAAR_CARD', fileSize: 1000, filePath: '/valid/path', mimeType: 'text/xml', status: 'VERIFIED', applicantType: 'BORROWER', uploadedAt: new Date('2026-08-01T00:00:00Z'), source: 'CUSTOMER' };
    prisma.lenderDocumentTransfer = { 
      findUnique: jest.fn().mockResolvedValue({ id: 200n, applicationId: 1n, transferStatus: 'PENDING', sourceDocumentId: 101n, lenderApplicationLinkId: 'LINK-1', sourceDocument: mockDocument }), 
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 200n, applicationId: 1n, transferStatus: 'PENDING', sourceDocumentId: 101n, lenderApplicationLinkId: 'LINK-1', sourceDocument: mockDocument }), 
      update: jest.fn() 
    };
    prisma.plCustomerDocument = { findUnique: jest.fn().mockResolvedValue(mockDocument) };
    
    (service as any).documentFiles.loadDocument = jest.fn().mockResolvedValue({ fileSize: 1000, fileSha256: 'mocked-hash', mimeType: 'text/xml', contentBase64: 'bW9jaw==' });

    // We mocked the hash generation inside the service as 'mocked-hash' for testing if it matches
    // But since `createHash('sha256').update(Buffer.from('mock-file-content')).digest('hex')` is used in service,
    // let's just make the adapter return whatever it receives.
    adapter.uploadDocument.mockImplementation(async (ctx: any) => ({
      acknowledged: true,
      providerStatus: 'RECEIVED',
      partnerDocumentId: 'DOC-1',
      fileSha256: ctx.fileSha256
    }));
    
    await service.processEvent('EVENT-3', 'LOCK-1');
    
    expect(adapter.uploadDocument).toHaveBeenCalled();
    expect(prisma.lenderDocumentTransfer.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ transferStatus: 'ACKNOWLEDGED' }) }));
    expect(prisma.lenderIntegrationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
  });

  it('PENDING invokes getStatus only', async () => {
    adapter.capabilities.statusPolling = true;
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

  describe('DISBURSE stage', () => {
    const setUpDisburseEvent = (loanOverrides: any = {}) => {
      adapter.capabilities.disbursement = true;
      adapter.requestDisbursal = jest.fn().mockResolvedValue({ acknowledged: true, providerStatus: 'ACCEPTED', disbursalReference: 'DISB-1' });

      const config = configFor('FINTREE_FINANCE_V1');
      const application = applicationFor(config) as any;
      application.status = 'LENDER_APPROVED';
      application.lenderApplicationLink.partnerApplicationId = 'PARTNER-1';

      prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-4', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'DISBURSE', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_REQUEST_DISBURSAL:V1', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId });
      prisma.plApplication.findUnique.mockResolvedValue(application);
      prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });
      prisma.plLoan.findUnique.mockResolvedValue({ id: 20n, applicationId: 1n, lan: 'FTPL00000001', approvedAmount: new Prisma.Decimal('18000'), disbursalStatus: null, status: 'READY_FOR_DISBURSAL', ...loanOverrides });

      return { config, application };
    };

    it('calls adapter.requestDisbursal and advances disbursalStatus to DISBURSAL_PROCESSING on ACK', async () => {
      setUpDisburseEvent();

      await service.processEvent('EVENT-4', 'LOCK-1');

      expect(adapter.requestDisbursal).toHaveBeenCalledWith(expect.objectContaining({ amount: '18000', triggerFund: true, platformLan: 'FTPL00000001' }));
      expect(prisma.plLoan.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ disbursalStatus: 'DISBURSAL_PROCESSING', disbursalProviderRef: 'DISB-1' }),
      }));
      expect(prisma.lenderIntegrationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
    });

    it('is a no-op if the loan is already DISBURSED (webhook won the race)', async () => {
      setUpDisburseEvent({ disbursalStatus: 'DISBURSED', status: 'DISBURSED' });

      await service.processEvent('EVENT-4', 'LOCK-1');

      expect(adapter.requestDisbursal).not.toHaveBeenCalled();
    });

    it('throws when the adapter does not support disbursement', async () => {
      setUpDisburseEvent();
      adapter.capabilities.disbursement = false;

      await expect(service.processEvent('EVENT-4', 'LOCK-1')).rejects.toThrow(
        expect.objectContaining({ code: 'FINTREE_DISBURSE_CONTRACT_NOT_ENABLED' }),
      );
    });

    it('throws when the application is not yet LENDER_APPROVED', async () => {
      const { application } = setUpDisburseEvent();
      application.status = 'PENDING_CREDIT_REVIEW';

      await expect(service.processEvent('EVENT-4', 'LOCK-1')).rejects.toThrow(
        expect.objectContaining({ code: 'LENDER_DISBURSE_BEFORE_APPROVAL' }),
      );
    });
  });

  describe('REPAYMENT stage', () => {
    const setUpRepaymentEvent = () => {
      adapter.capabilities.repaymentNotification = true;
      adapter.recordRepayment = jest.fn().mockResolvedValue({ acknowledged: true, providerStatus: 'REPAYMENT_RECORDED' });

      const config = configFor('FINTREE_FINANCE_V1');
      const application = applicationFor(config) as any;
      application.lenderApplicationLink.partnerApplicationId = 'PARTNER-1';

      prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-5', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'REPAYMENT', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_NOTIFY_REPAYMENT:501', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId, repaymentId: 501n });
      prisma.plApplication.findUnique.mockResolvedValue(application);
      prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });
      prisma.plRepayment = { findUnique: jest.fn().mockResolvedValue({ id: 501n, amountReceived: new Prisma.Decimal('5115.00'), paymentDate: new Date('2026-08-30T00:00:00Z'), paymentId: 'PAYID12345', paymentMode: 'UPI', referenceNumber: 'UTR1234567890' }) };

      return { config, application };
    };

    it('calls adapter.recordRepayment with the repayment fields and marks the event COMPLETED', async () => {
      setUpRepaymentEvent();

      await service.processEvent('EVENT-5', 'LOCK-1');

      expect(prisma.plRepayment.findUnique).toHaveBeenCalledWith({ where: { id: 501n } });
      expect(adapter.recordRepayment).toHaveBeenCalledWith(expect.objectContaining({
        partnerApplicationId: 'PARTNER-1',
        amount: '5115',
        paymentDate: '2026-08-30',
        paymentId: 'PAYID12345',
        paymentMode: 'UPI',
        utr: 'UTR1234567890',
      }));
      expect(prisma.lenderIntegrationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
    });

    it('throws when the adapter does not support repayment notification', async () => {
      setUpRepaymentEvent();
      adapter.capabilities.repaymentNotification = false;

      await expect(service.processEvent('EVENT-5', 'LOCK-1')).rejects.toThrow(
        expect.objectContaining({ code: 'FINTREE_REPAYMENT_CONTRACT_NOT_ENABLED' }),
      );
    });

    it('throws LENDER_SERVICING_BEFORE_CREATE when partnerApplicationId is missing', async () => {
      const { application } = setUpRepaymentEvent();
      application.lenderApplicationLink.partnerApplicationId = null;

      await expect(service.processEvent('EVENT-5', 'LOCK-1')).rejects.toThrow(
        expect.objectContaining({ code: 'LENDER_SERVICING_BEFORE_CREATE' }),
      );
    });

    it('throws LENDER_REPAYMENT_NOT_ACKNOWLEDGED when the lender does not acknowledge', async () => {
      setUpRepaymentEvent();
      adapter.recordRepayment.mockResolvedValue({ acknowledged: false, providerStatus: 'FAILED' });

      await expect(service.processEvent('EVENT-5', 'LOCK-1')).rejects.toThrow(
        expect.objectContaining({ code: 'LENDER_REPAYMENT_NOT_ACKNOWLEDGED' }),
      );
    });
  });

  describe('CHARGE stage', () => {
    const setUpChargeEvent = () => {
      adapter.capabilities.chargeNotification = true;
      adapter.addCharge = jest.fn().mockResolvedValue({ acknowledged: true, providerStatus: 'CHARGE_ADDED' });

      const config = configFor('FINTREE_FINANCE_V1');
      const application = applicationFor(config) as any;
      application.lenderApplicationLink.partnerApplicationId = 'PARTNER-1';

      prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-6', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'CHARGE', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_NOTIFY_CHARGE:601', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId, chargeId: 601n });
      prisma.plApplication.findUnique.mockResolvedValue(application);
      prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });
      prisma.plLoanCharge = { findUnique: jest.fn().mockResolvedValue({ id: 601n, chargeType: 'BOUNCE_CHARGE', amount: new Prisma.Decimal('500.00'), dueDate: new Date('2026-09-05T00:00:00Z'), description: 'Cheque bounced' }) };

      return { config, application };
    };

    it('calls adapter.addCharge with the charge fields and marks the event COMPLETED', async () => {
      setUpChargeEvent();

      await service.processEvent('EVENT-6', 'LOCK-1');

      expect(prisma.plLoanCharge.findUnique).toHaveBeenCalledWith({ where: { id: 601n } });
      expect(adapter.addCharge).toHaveBeenCalledWith(expect.objectContaining({
        partnerApplicationId: 'PARTNER-1',
        chargeType: 'BOUNCE_CHARGE',
        amount: '500',
        dueDate: '2026-09-05',
        remarks: 'Cheque bounced',
      }));
      expect(prisma.lenderIntegrationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
    });

    it('throws when the adapter does not support charge notification', async () => {
      setUpChargeEvent();
      adapter.capabilities.chargeNotification = false;

      await expect(service.processEvent('EVENT-6', 'LOCK-1')).rejects.toThrow(
        expect.objectContaining({ code: 'FINTREE_CHARGE_CONTRACT_NOT_ENABLED' }),
      );
    });

    it('throws LENDER_CHARGE_DUE_DATE_MISSING when the charge has no due date', async () => {
      setUpChargeEvent();
      prisma.plLoanCharge.findUnique.mockResolvedValue({ id: 601n, chargeType: 'BOUNCE_CHARGE', amount: new Prisma.Decimal('500.00'), dueDate: null, description: null });

      await expect(service.processEvent('EVENT-6', 'LOCK-1')).rejects.toThrow(
        expect.objectContaining({ code: 'LENDER_CHARGE_DUE_DATE_MISSING' }),
      );
    });
  });

  describe('CHARGE_WAIVER stage', () => {
    const setUpChargeWaiverEvent = () => {
      adapter.capabilities.chargeWaiverNotification = true;
      adapter.waiveCharge = jest.fn().mockResolvedValue({ acknowledged: true, providerStatus: 'CHARGE_WAIVED' });

      const config = configFor('FINTREE_FINANCE_V1');
      const application = applicationFor(config) as any;
      application.lenderApplicationLink.partnerApplicationId = 'PARTNER-1';

      prisma.lenderIntegrationOutbox.findUnique.mockResolvedValue({ id: 'EVENT-7', status: 'PROCESSING', lockToken: 'LOCK-1', integrationStage: 'CHARGE_WAIVER', payloadVersion: 1, idempotencyKey: 'APP-001:LENDER_NOTIFY_CHARGE_WAIVER:701', applicationId: 1n, applicationReference: 'APP-001', lenderId: config.lenderId, chargeWaiverId: 701n });
      prisma.plApplication.findUnique.mockResolvedValue(application);
      prisma.mlmAllocationDecision.findUnique.mockResolvedValue({ id: 'DEC-1', status: 'ASSIGNED', lenderId: config.lenderId, productId: 'PRODUCT-1', productVersionId: 'PSV-1' });
      prisma.plLoanChargeWaiver = {
        findUnique: jest.fn().mockResolvedValue({ id: 701n, waiverAmount: new Prisma.Decimal('250.00'), charge: { chargeType: 'BOUNCE_CHARGE' } }),
        update: jest.fn(),
      };

      return { config, application };
    };

    it('calls adapter.waiveCharge with the waiver fields, sets lenderNotifiedAt and marks the event COMPLETED', async () => {
      setUpChargeWaiverEvent();

      await service.processEvent('EVENT-7', 'LOCK-1');

      expect(prisma.plLoanChargeWaiver.findUnique).toHaveBeenCalledWith({ where: { id: 701n }, include: { charge: true } });
      expect(adapter.waiveCharge).toHaveBeenCalledWith(expect.objectContaining({
        partnerApplicationId: 'PARTNER-1',
        chargeType: 'BOUNCE_CHARGE',
        waiverAmount: '250',
      }));
      expect(prisma.plLoanChargeWaiver.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 701n },
        data: expect.objectContaining({ lenderNotifiedAt: expect.any(Date) }),
      }));
      expect(prisma.lenderIntegrationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
    });

    it('throws when the adapter does not support charge waiver notification', async () => {
      setUpChargeWaiverEvent();
      adapter.capabilities.chargeWaiverNotification = false;

      await expect(service.processEvent('EVENT-7', 'LOCK-1')).rejects.toThrow(
        expect.objectContaining({ code: 'FINTREE_CHARGE_WAIVER_CONTRACT_NOT_ENABLED' }),
      );
    });

    it('throws LENDER_CHARGE_WAIVER_NOT_ACKNOWLEDGED when the lender does not acknowledge', async () => {
      setUpChargeWaiverEvent();
      adapter.waiveCharge.mockResolvedValue({ acknowledged: false, providerStatus: 'FAILED' });

      await expect(service.processEvent('EVENT-7', 'LOCK-1')).rejects.toThrow(
        expect.objectContaining({ code: 'LENDER_CHARGE_WAIVER_NOT_ACKNOWLEDGED' }),
      );
    });
  });
});
