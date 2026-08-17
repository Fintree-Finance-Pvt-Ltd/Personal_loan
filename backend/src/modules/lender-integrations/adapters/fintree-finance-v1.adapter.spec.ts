import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FintreeFinanceV1Adapter } from './fintree-finance-v1.adapter';
import { LenderHttpService } from '../lender-http.service';
import { LenderIntegrationError } from '../lender-integration.errors';
import * as crypto from 'crypto';

describe('FintreeFinanceV1Adapter', () => {
  let adapter: FintreeFinanceV1Adapter;
  let httpService: jest.Mocked<LenderHttpService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    httpService = {
      requestJson: jest.fn(),
      resolveRequestUrl: jest.fn().mockReturnValue(new URL('https://api.fintree.local/foo')),
    } as any;

    configService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FintreeFinanceV1Adapter,
        { provide: LenderHttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    adapter = module.get<FintreeFinanceV1Adapter>(FintreeFinanceV1Adapter);
  });

  const getBaseContext = (authType: 'BEARER_TOKEN' | 'CUSTOM' = 'CUSTOM') => ({
    transport: {
      lenderId: 'FINTREE',
      baseUrl: 'https://api.fintree.local',
      authType,
      clientId: 'fintree-client-123',
      credentialSecretReference: 'FINTREE_SECRET',
      createApplicationPath: '/create',
      submitConsentPath: '/consent',
      updateDetailsPath: '/details',
      uploadDocumentPath: '/docs',
      decisionPath: '/decision',
      statusPath: '/status',
      disbursePath: '/disburse',
      requestTimeoutMs: 5000,
      options: {},
    },
    application: { applicationReference: 'APP-123', platformLan: 'FTPL123', requestedAmount: '25000', requestedTenure: 90, tenureType: 'DAYS' },
    allocation: { externalProductCode: 'PL-FINTREE' },
    customer: { 
      panNumber: 'ABCDE1234F',
      panVerified: true,
      fullName: 'Test Customer',
      firstName: 'Test',
      lastName: 'Customer',
      fatherName: 'Father Customer',
      dateOfBirth: '1990-01-01',
    },
    idempotencyKey: 'idem-key-1',
  });

  describe('Authentication flows', () => {
    it('throws if API key secret reference is missing', async () => {
      const context = getBaseContext('API_KEY' as any);
      context.transport.credentialSecretReference = '';

      await expect(adapter.createApplication(context as any)).rejects.toThrow(
        new LenderIntegrationError('FINTREE_SECRET_REFERENCE_MISSING', 'Fintree secret reference is missing.', 'AUTHENTICATION_CONFIGURATION')
      );
    });

    it('throws if API key secret is not configured', async () => {
      const context = getBaseContext('API_KEY' as any);
      configService.get.mockReturnValue(undefined);

      await expect(adapter.createApplication(context as any)).rejects.toThrow(
        new LenderIntegrationError('FINTREE_SECRET_NOT_CONFIGURED', 'Fintree authentication secret is not configured.', 'AUTHENTICATION_CONFIGURATION')
      );
    });

    it('injects API key header correctly', async () => {
      const context = getBaseContext('API_KEY' as any);
      configService.get.mockReturnValue('my-api-key');
      httpService.requestJson.mockResolvedValue({ status: 200, data: { success: true, correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157', data: { status: 'CREATED', partnerApplicationId: 'P-123', partnerApplicationNumber: 'PN-123', externalApplicationReference: 'APP-123', lan: 'FTPL123', createdAt: '2026-08-04T00:00:00Z' } } });

      await adapter.createApplication(context as any);

      expect(configService.get).toHaveBeenCalledWith('FINTREE_SECRET');
      expect(httpService.requestJson).toHaveBeenCalledWith(expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'my-api-key'
        }),
      }));
    });
  });

  describe('Payload and Schema constraints', () => {
    it('creates an application and parses ACKNOWLEDGED successfully', async () => {
      const context = getBaseContext('API_KEY' as any);
      configService.get.mockReturnValue('my-api-key');
      httpService.requestJson.mockResolvedValue({ status: 200, data: { success: true, correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157', data: { status: 'CREATED', partnerApplicationId: 'P-123', partnerApplicationNumber: 'PN-123', externalApplicationReference: 'APP-123', lan: 'FTPL123', createdAt: '2026-08-04T00:00:00Z' } } });

      const result = await adapter.createApplication(context as any);
      expect(result.acknowledged).toBe(true);
      expect(result.partnerApplicationId).toBe('P-123');
    });

    it('throws LENDER_VALIDATION_ERROR if required Fintree field is missing', async () => {
      const context = getBaseContext('API_KEY' as any);
      configService.get.mockReturnValue('my-api-key');
      httpService.requestJson.mockResolvedValue({ status: 200, data: { status: 'UNKNOWN' } });

      await expect(adapter.createApplication(context as any)).rejects.toThrow(LenderIntegrationError);
    });
  });

  describe('requestDecision', () => {
    const getDecisionContext = () => ({
      ...getBaseContext('API_KEY' as any),
      partnerApplicationId: 'P-123',
      applicationReference: 'APP-123',
      externalProductCode: 'PL-FINTREE',
      profileComplete: true,
      bureauConsentReference: 'BUREAU-1',
      bureauConsentHash: 'hash-1',
      lenderDecisionConsentReference: 'DECISION-1',
      lenderDecisionConsentHash: 'hash-2',
    });

    beforeEach(() => {
      configService.get.mockReturnValue('my-api-key');
    });

    it('maps a new-customer approval to the new-customer credit limit', async () => {
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: {
          success: true,
          correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157',
          data: {
            status: 'Approved',
            CREDIT_LIMIT_CHECK_RPM: {
              derived_values: {
                LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM: 8000,
                LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM: 0,
              },
            },
          },
        },
      });

      const result = await adapter.requestDecision(getDecisionContext() as any);
      expect(result.decision).toBe('APPROVED');
      expect(result.approvedAmount).toBe('8000');
    });

    it('maps a repeat-customer approval to the repeat-customer credit limit', async () => {
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: {
          success: true,
          correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157',
          data: {
            status: 'Approved',
            CREDIT_LIMIT_CHECK_RPM: {
              derived_values: {
                LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM: 0,
                LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM: 15000,
              },
            },
          },
        },
      });

      const result = await adapter.requestDecision(getDecisionContext() as any);
      expect(result.decision).toBe('APPROVED');
      expect(result.approvedAmount).toBe('15000');
    });

    it('maps a Rejected status to a REJECTED decision', async () => {
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: { success: true, correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157', data: { status: 'Rejected' } },
      });

      const result = await adapter.requestDecision(getDecisionContext() as any);
      expect(result.decision).toBe('REJECTED');
      expect(result.rejectionReasonCode).toBe('LENDER_CRITERIA_NOT_MET');
    });

    it('throws if Approved but no non-zero credit limit is present', async () => {
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: {
          success: true,
          correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157',
          data: {
            status: 'Approved',
            CREDIT_LIMIT_CHECK_RPM: {
              derived_values: {
                LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM: 0,
                LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM: 0,
              },
            },
          },
        },
      });

      await expect(adapter.requestDecision(getDecisionContext() as any)).rejects.toThrow(
        expect.objectContaining({ code: 'FINTREE_CREDIT_LIMIT_MISSING' }),
      );
    });

    it('throws on an unrecognized decision status', async () => {
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: { success: true, correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157', data: { status: 'SomeUnknownStatus' } },
      });

      await expect(adapter.requestDecision(getDecisionContext() as any)).rejects.toThrow(
        expect.objectContaining({ code: 'FINTREE_DECISION_STATUS_UNRECOGNIZED' }),
      );
    });

    it('maps a credit-queue/processing status to a PENDING decision (expected on the final approval call)', async () => {
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: { success: true, correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157', data: { status: 'Pending' } },
      });

      const result = await adapter.requestDecision(getDecisionContext() as any);
      expect(result.decision).toBe('PENDING');
    });

    it('throws a partner error when Fintree responds with success:false', async () => {
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: {
          success: false,
          correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157',
          error: { code: 'VALIDATION_ERROR', message: 'aadhaarKyc.maskedAadhaar is required.' },
        },
      });

      await expect(adapter.requestDecision(getDecisionContext() as any)).rejects.toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      );
    });
  });

  describe('requestDisbursal', () => {
    const getDisburseContext = () => ({
      ...getBaseContext('API_KEY' as any),
      partnerApplicationId: 'P-123',
      applicationReference: 'APP-123',
      platformLan: 'FTPL123',
      amount: '18000',
      triggerFund: true as const,
    });

    beforeEach(() => {
      configService.get.mockReturnValue('my-api-key');
    });

    it('sends trigger_fund=true and the final accepted amount, and acknowledges on success', async () => {
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: { success: true, correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157', data: { status: 'ACCEPTED', disbursalReference: 'DISB-1' } },
      });

      const result = await adapter.requestDisbursal(getDisburseContext() as any);

      expect(result.acknowledged).toBe(true);
      expect(result.providerStatus).toBe('ACCEPTED');
      expect(result.disbursalReference).toBe('DISB-1');
      expect(httpService.requestJson).toHaveBeenCalledWith(expect.objectContaining({
        body: JSON.stringify({ externalApplicationReference: 'APP-123', lan: 'FTPL123', amount: '18000', trigger_fund: true }),
      }));
    });

    it('throws a partner error when Fintree responds with success:false', async () => {
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: {
          success: false,
          correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157',
          error: { code: 'VALIDATION_ERROR', message: 'amount is required.' },
        },
      });

      await expect(adapter.requestDisbursal(getDisburseContext() as any)).rejects.toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      );
    });

    it('throws FINTREE_ENDPOINT_NOT_CONFIGURED when disbursePath is missing', async () => {
      const context = getDisburseContext();
      (context as any).transport.disbursePath = null;

      await expect(adapter.requestDisbursal(context as any)).rejects.toThrow(
        expect.objectContaining({ code: 'FINTREE_ENDPOINT_NOT_CONFIGURED' }),
      );
    });
  });

  describe('recordRepayment', () => {
    const getRepaymentContext = () => ({
      ...getBaseContext('API_KEY' as any),
      partnerApplicationId: 'P-123',
      applicationReference: 'APP-123',
      platformLan: 'FTPL123',
      amount: '5115.00',
      paymentDate: '2026-08-30',
      paymentId: 'PAYID12345',
      paymentMode: 'UPI',
      utr: 'UTR1234567890',
    });

    beforeEach(() => {
      configService.get.mockReturnValue('my-api-key');
    });

    it('sends the confirmed Fintree repayment payload shape and acknowledges REPAYMENT_RECORDED', async () => {
      (getRepaymentContext().transport as any).repaymentPath = '/repayment';
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: { success: true, correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157', data: { status: 'REPAYMENT_RECORDED' } },
      });

      const context = getRepaymentContext();
      (context.transport as any).repaymentPath = '/repayment';

      const result = await adapter.recordRepayment(context as any);

      expect(result.acknowledged).toBe(true);
      expect(result.providerStatus).toBe('REPAYMENT_RECORDED');
      expect(httpService.requestJson).toHaveBeenCalledWith(expect.objectContaining({
        body: JSON.stringify({
          externalApplicationReference: 'APP-123',
          lan: 'FTPL123',
          amount: '5115.00',
          paymentDate: '2026-08-30',
          paymentId: 'PAYID12345',
          paymentMode: 'UPI',
          utr: 'UTR1234567890',
        }),
      }));
    });

    it('throws a partner error (e.g. DUPLICATE_UTR) when Fintree responds with success:false', async () => {
      const context = getRepaymentContext();
      (context.transport as any).repaymentPath = '/repayment';
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: {
          success: false,
          correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157',
          error: { code: 'DUPLICATE_UTR', message: "UTR 'UTR1234567890' already used." },
        },
      });

      await expect(adapter.recordRepayment(context as any)).rejects.toThrow(
        expect.objectContaining({ code: 'DUPLICATE_UTR' }),
      );
    });

    it('throws FINTREE_ENDPOINT_NOT_CONFIGURED when repaymentPath is missing', async () => {
      const context = getRepaymentContext();
      (context.transport as any).repaymentPath = null;

      await expect(adapter.recordRepayment(context as any)).rejects.toThrow(
        expect.objectContaining({ code: 'FINTREE_ENDPOINT_NOT_CONFIGURED' }),
      );
    });
  });

  describe('addCharge', () => {
    const getChargeContext = () => ({
      ...getBaseContext('API_KEY' as any),
      partnerApplicationId: 'P-123',
      applicationReference: 'APP-123',
      platformLan: 'FTPL123',
      chargeType: 'BOUNCE_CHARGE',
      amount: '500.00',
      dueDate: '2026-09-05',
      remarks: 'Cheque bounced',
    });

    beforeEach(() => {
      configService.get.mockReturnValue('my-api-key');
    });

    it('sends the confirmed Fintree charge payload shape and acknowledges CHARGE_ADDED', async () => {
      const context = getChargeContext();
      (context.transport as any).chargePath = '/charges';
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: { success: true, correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157', data: { status: 'CHARGE_ADDED' } },
      });

      const result = await adapter.addCharge(context as any);

      expect(result.acknowledged).toBe(true);
      expect(result.providerStatus).toBe('CHARGE_ADDED');
      expect(httpService.requestJson).toHaveBeenCalledWith(expect.objectContaining({
        body: JSON.stringify({
          externalApplicationReference: 'APP-123',
          lan: 'FTPL123',
          chargeType: 'BOUNCE_CHARGE',
          amount: '500.00',
          dueDate: '2026-09-05',
          remarks: 'Cheque bounced',
        }),
      }));
    });

    it('throws FINTREE_ENDPOINT_NOT_CONFIGURED when chargePath is missing', async () => {
      const context = getChargeContext();
      (context.transport as any).chargePath = null;

      await expect(adapter.addCharge(context as any)).rejects.toThrow(
        expect.objectContaining({ code: 'FINTREE_ENDPOINT_NOT_CONFIGURED' }),
      );
    });
  });

  describe('waiveCharge', () => {
    const getWaiverContext = () => ({
      ...getBaseContext('API_KEY' as any),
      partnerApplicationId: 'P-123',
      applicationReference: 'APP-123',
      platformLan: 'FTPL123',
      chargeType: 'BOUNCE_CHARGE',
      waiverAmount: '250.00',
    });

    beforeEach(() => {
      configService.get.mockReturnValue('my-api-key');
    });

    it('sends the confirmed Fintree waiver payload shape and acknowledges CHARGE_WAIVED', async () => {
      const context = getWaiverContext();
      (context.transport as any).chargeWaiverPath = '/charges/waiver';
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: { success: true, correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157', data: { status: 'CHARGE_WAIVED' } },
      });

      const result = await adapter.waiveCharge(context as any);

      expect(result.acknowledged).toBe(true);
      expect(result.providerStatus).toBe('CHARGE_WAIVED');
      expect(httpService.requestJson).toHaveBeenCalledWith(expect.objectContaining({
        body: JSON.stringify({
          externalApplicationReference: 'APP-123',
          lan: 'FTPL123',
          chargeType: 'BOUNCE_CHARGE',
          waiverAmount: '250.00',
        }),
      }));
    });

    it('throws a partner error (e.g. CHARGE_NOT_FOUND) when Fintree responds with success:false', async () => {
      const context = getWaiverContext();
      (context.transport as any).chargeWaiverPath = '/charges/waiver';
      httpService.requestJson.mockResolvedValue({
        status: 200,
        data: {
          success: false,
          correlationId: '47d96ed0-643a-4467-96a8-a90b4d4dc157',
          error: { code: 'CHARGE_NOT_FOUND', message: 'No unpaid charge of that type.' },
        },
      });

      await expect(adapter.waiveCharge(context as any)).rejects.toThrow(
        expect.objectContaining({ code: 'CHARGE_NOT_FOUND' }),
      );
    });

    it('throws FINTREE_ENDPOINT_NOT_CONFIGURED when chargeWaiverPath is missing', async () => {
      const context = getWaiverContext();
      (context.transport as any).chargeWaiverPath = null;

      await expect(adapter.waiveCharge(context as any)).rejects.toThrow(
        expect.objectContaining({ code: 'FINTREE_ENDPOINT_NOT_CONFIGURED' }),
      );
    });
  });
});
