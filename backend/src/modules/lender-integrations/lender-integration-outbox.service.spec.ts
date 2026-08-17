import { LenderIntegrationOutboxService } from './lender-integration-outbox.service';
import { createHash } from 'crypto';

describe('LenderIntegrationOutboxService', () => {
  it('creates an identifier-only idempotent CREATE event', async () => {
    const tx: any = {
      plApplication: { findUnique: jest.fn().mockResolvedValue({ id: 1n, customerId: 2n, applicationNumber: 'APP-001', status: 'ASSESSMENT_FEE_PAID', mlmAllocationDecisionId: 'DEC-1', lenderId: 'L1', lenderProductId: 'P1', productStrategyVersionId: 'PV1', platformLan: 'FTPL00000001' }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 1n, customerId: 2n, applicationNumber: 'APP-001', status: 'ASSESSMENT_FEE_PAID', mlmAllocationDecisionId: 'DEC-1', lenderId: 'L1', lenderProductId: 'P1', productStrategyVersionId: 'PV1', platformLan: 'FTPL00000001' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      mlmAllocationDecision: { findUnique: jest.fn().mockResolvedValue({ status: 'ASSIGNED', lenderId: 'L1', productId: 'P1', productVersionId: 'PV1' }) },
      plPaymentLink: { findFirst: jest.fn().mockResolvedValue({ id: 10n }) },
      lenderDataSharingConsent: { findFirst: jest.fn().mockResolvedValue({ id: 'CONSENT-1', consentText: 'Exact consent evidence', consentTextHash: createHash('sha256').update('Exact consent evidence', 'utf8').digest('hex') }) },
      lenderApplicationLink: { findUnique: jest.fn().mockResolvedValue(null) },
      lenderIntegrationOutbox: { upsert: jest.fn().mockImplementation(({ create }: any) => create) },
    };
    const service = new LenderIntegrationOutboxService({} as any, {} as any);
    const result: any = await service.enqueueCreateAfterVerifiedPayment(tx, 1n);
    expect(result.idempotencyKey).toBe('APP-001:LENDER_CREATE_APPLICATION:V1');
    expect(result).toEqual(expect.objectContaining({ applicationId: 1n, applicationReference: 'APP-001', lenderId: 'L1', integrationStage: 'CREATE' }));
    const storedFields = Object.keys(result).join(',').toLowerCase();
    expect(storedFields).not.toContain('mobile');
    expect(storedFields).not.toContain('pan');
  });

  it('returns structured reason codes and does not enqueue an incomplete UPDATE', async () => {
    const application: any = {
      id: 1n,
      platformLan: null,
      lenderApplicationLink: { createStatus: 'PENDING', partnerApplicationId: null },
      employmentSnapshot: null,
      kycSnapshot: null,
      addresses: [],
      liveness: null,
      stageConsents: [],
    };
    const prisma: any = {
      plApplication: { findUnique: jest.fn().mockResolvedValue(application) },
      $transaction: jest.fn(),
    };
    const service = new LenderIntegrationOutboxService(prisma, {} as any);
    const result = await service.enqueueUpdateWhenReady(1n);
    expect(result.enqueued).toBe(false);
    expect(result.readiness.reasons).toEqual(expect.arrayContaining([
      'PLATFORM_LAN_MISSING', 'CREATE_NOT_COMPLETED', 'PARTNER_APPLICATION_ID_MISSING',
      'CONSENT_NOT_COMPLETED', 'EMPLOYMENT_SNAPSHOT_MISSING', 'MONTHLY_INCOME_MISSING',
      'LIVENESS_NOT_VERIFIED', 'DIGILOCKER_KYC_NOT_VERIFIED', 'AADHAAR_VERIFIED_NAME_MISSING',
      'PERMANENT_ADDRESS_MISSING', 'CURRENT_ADDRESS_MISSING', 'UPDATE_CONSENT_MISSING',
    ]));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates one stable UPDATE event when all prerequisites are complete', async () => {
    const consentText = 'Exact update consent';
    const application: any = {
      id: 1n, applicationNumber: 'APP-001', lenderId: 'L1', platformLan: 'FTPL123',
      lenderApplicationLink: { createStatus: 'ACKNOWLEDGED', consentStatus: 'ACKNOWLEDGED', partnerApplicationId: 'PARTNER-1', lastSyncedStage: 'CONSENT' },
      employmentSnapshot: { completedAt: new Date(), monthlyIncome: 50000, employmentType: 'SALARIED', companyName: 'ACME', designation: 'Engineer' },
      kycSnapshot: { verificationStatus: 'VERIFIED', verifiedAt: new Date(), verifiedName: 'Test Customer' },
      addresses: [
        { addressType: 'PERMANENT' },
        { addressType: 'CURRENT', sameAsPermanent: true },
      ],
      liveness: { verificationStatus: 'VERIFIED', verifiedAt: new Date(), photoDocument: { id: 9n } },
      stageConsents: [
        { consentType: 'DATA_SHARING', consentText, consentTextHash: createHash('sha256').update(consentText).digest('hex'), revokedAt: null },
        { consentType: 'DOCUMENT_SHARING', consentText, consentTextHash: createHash('sha256').update(consentText).digest('hex'), revokedAt: null },
        { consentType: 'TERMS_AND_CONDITIONS', consentText, consentTextHash: createHash('sha256').update(consentText).digest('hex'), revokedAt: null }
      ],
    };
    const tx: any = {
      lenderIntegrationOutbox: { upsert: jest.fn().mockImplementation(({ create }: any) => create) },
      lenderApplicationLink: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ updateStatus: 'PENDING', updatePayloadVersion: 0 }) },
    };
    const prisma: any = {
      plApplication: { findUnique: jest.fn().mockResolvedValue(application) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new LenderIntegrationOutboxService(prisma, {} as any);
    const first = await service.enqueueUpdateWhenReady(1n);
    const second = await service.enqueueUpdateWhenReady(1n);
    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(true);
    expect(tx.lenderIntegrationOutbox.upsert).toHaveBeenCalledTimes(2);
    expect(tx.lenderIntegrationOutbox.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'APP-001:LENDER_UPDATE_APPLICATION:V1' },
      update: {},
    }));
  });

  it('blocks DECISION until UPDATE is acknowledged and all three consents exist', async () => {
    const prisma: any = {
      plApplication: { findUnique: jest.fn().mockResolvedValue({
        id: 1n, lenderId: 'L1', lenderApplicationLink: { updateStatus: 'PENDING' }, stageConsents: [],
      }) },
      lenderIntegrationConfig: { findFirst: jest.fn().mockResolvedValue({ adapterKey: 'FINTREE_FINANCE', adapterVersion: '1' }) },
    };
    const adapters: any = { resolve: jest.fn().mockReturnValue({ capabilities: { decisionRequest: true } }) };
    const service = new LenderIntegrationOutboxService(prisma, adapters);
    await expect(service.enqueueDecisionWhenReady(1n)).rejects.toThrow('Lender UPDATE must be acknowledged');

    prisma.plApplication.findUnique.mockResolvedValue({
      id: 1n, lenderId: 'L1', lenderApplicationLink: { updateStatus: 'ACKNOWLEDGED' }, stageConsents: [],
    });
    await expect(service.enqueueDecisionWhenReady(1n)).rejects.toThrow('BUREAU_ENQUIRY consent evidence');
  });

  describe('enqueueDisbursalWhenReady', () => {
    it('enqueues a DISBURSE stage event once a loan exists for the application', async () => {
      const prisma: any = {
        plApplication: { findUnique: jest.fn().mockResolvedValue({ id: 1n, applicationNumber: 'APP-001', lenderId: 'L1' }) },
        plLoan: { findUnique: jest.fn().mockResolvedValue({ id: 10n, applicationId: 1n }) },
        lenderIntegrationOutbox: { upsert: jest.fn().mockImplementation(({ create }: any) => create) },
      };
      const service = new LenderIntegrationOutboxService(prisma, {} as any);
      const event = await service.enqueueDisbursalWhenReady(1n);

      expect(prisma.lenderIntegrationOutbox.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { idempotencyKey: 'APP-001:LENDER_REQUEST_DISBURSAL:V1' },
        create: expect.objectContaining({ eventType: 'LENDER_REQUEST_DISBURSAL', integrationStage: 'DISBURSE', applicationId: 1n }),
      }));
      expect(event.integrationStage).toBe('DISBURSE');
    });

    it('throws when no loan exists for the application yet', async () => {
      const prisma: any = {
        plApplication: { findUnique: jest.fn().mockResolvedValue({ id: 1n, applicationNumber: 'APP-001', lenderId: 'L1' }) },
        plLoan: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new LenderIntegrationOutboxService(prisma, {} as any);
      await expect(service.enqueueDisbursalWhenReady(1n)).rejects.toThrow('No loan exists for this application yet.');
    });
  });

  describe('enqueueRepaymentNotification', () => {
    it('enqueues a REPAYMENT stage event keyed on the specific repayment id', async () => {
      const prisma: any = {
        plApplication: { findUnique: jest.fn().mockResolvedValue({ id: 1n, applicationNumber: 'APP-001', lenderId: 'L1' }) },
        lenderIntegrationOutbox: { upsert: jest.fn().mockImplementation(({ create }: any) => create) },
      };
      const service = new LenderIntegrationOutboxService(prisma, {} as any);
      const event = await service.enqueueRepaymentNotification(1n, 501n);

      expect(prisma.lenderIntegrationOutbox.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { idempotencyKey: 'APP-001:LENDER_NOTIFY_REPAYMENT:501' },
        create: expect.objectContaining({ eventType: 'LENDER_NOTIFY_REPAYMENT', integrationStage: 'REPAYMENT', applicationId: 1n, repaymentId: 501n }),
      }));
      expect(event.integrationStage).toBe('REPAYMENT');
    });

    it('throws when the application has no allocated lender', async () => {
      const prisma: any = {
        plApplication: { findUnique: jest.fn().mockResolvedValue({ id: 1n, applicationNumber: 'APP-001', lenderId: null }) },
      };
      const service = new LenderIntegrationOutboxService(prisma, {} as any);
      await expect(service.enqueueRepaymentNotification(1n, 501n)).rejects.toThrow('Allocated lender is missing.');
    });

    it('keys a second repayment on the same loan into its own outbox row', async () => {
      const prisma: any = {
        plApplication: { findUnique: jest.fn().mockResolvedValue({ id: 1n, applicationNumber: 'APP-001', lenderId: 'L1' }) },
        lenderIntegrationOutbox: { upsert: jest.fn().mockImplementation(({ create }: any) => create) },
      };
      const service = new LenderIntegrationOutboxService(prisma, {} as any);
      await service.enqueueRepaymentNotification(1n, 501n);
      await service.enqueueRepaymentNotification(1n, 502n);

      expect(prisma.lenderIntegrationOutbox.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { idempotencyKey: 'APP-001:LENDER_NOTIFY_REPAYMENT:501' } }));
      expect(prisma.lenderIntegrationOutbox.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { idempotencyKey: 'APP-001:LENDER_NOTIFY_REPAYMENT:502' } }));
    });
  });

  describe('enqueueChargeNotification', () => {
    it('enqueues a CHARGE stage event keyed on the specific charge id', async () => {
      const prisma: any = {
        plApplication: { findUnique: jest.fn().mockResolvedValue({ id: 1n, applicationNumber: 'APP-001', lenderId: 'L1' }) },
        lenderIntegrationOutbox: { upsert: jest.fn().mockImplementation(({ create }: any) => create) },
      };
      const service = new LenderIntegrationOutboxService(prisma, {} as any);
      const event = await service.enqueueChargeNotification(1n, 601n);

      expect(prisma.lenderIntegrationOutbox.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { idempotencyKey: 'APP-001:LENDER_NOTIFY_CHARGE:601' },
        create: expect.objectContaining({ eventType: 'LENDER_NOTIFY_CHARGE', integrationStage: 'CHARGE', applicationId: 1n, chargeId: 601n }),
      }));
      expect(event.integrationStage).toBe('CHARGE');
    });

    it('throws when the application has no allocated lender', async () => {
      const prisma: any = {
        plApplication: { findUnique: jest.fn().mockResolvedValue({ id: 1n, applicationNumber: 'APP-001', lenderId: null }) },
      };
      const service = new LenderIntegrationOutboxService(prisma, {} as any);
      await expect(service.enqueueChargeNotification(1n, 601n)).rejects.toThrow('Allocated lender is missing.');
    });
  });

  describe('enqueueChargeWaiverNotification', () => {
    it('enqueues a CHARGE_WAIVER stage event keyed on the specific waiver id', async () => {
      const prisma: any = {
        plApplication: { findUnique: jest.fn().mockResolvedValue({ id: 1n, applicationNumber: 'APP-001', lenderId: 'L1' }) },
        lenderIntegrationOutbox: { upsert: jest.fn().mockImplementation(({ create }: any) => create) },
      };
      const service = new LenderIntegrationOutboxService(prisma, {} as any);
      const event = await service.enqueueChargeWaiverNotification(1n, 701n);

      expect(prisma.lenderIntegrationOutbox.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { idempotencyKey: 'APP-001:LENDER_NOTIFY_CHARGE_WAIVER:701' },
        create: expect.objectContaining({ eventType: 'LENDER_NOTIFY_CHARGE_WAIVER', integrationStage: 'CHARGE_WAIVER', applicationId: 1n, chargeWaiverId: 701n }),
      }));
      expect(event.integrationStage).toBe('CHARGE_WAIVER');
    });

    it('throws when the application has no allocated lender', async () => {
      const prisma: any = {
        plApplication: { findUnique: jest.fn().mockResolvedValue({ id: 1n, applicationNumber: 'APP-001', lenderId: null }) },
      };
      const service = new LenderIntegrationOutboxService(prisma, {} as any);
      await expect(service.enqueueChargeWaiverNotification(1n, 701n)).rejects.toThrow('Allocated lender is missing.');
    });
  });
});
