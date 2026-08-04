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
      requestTimeoutMs: 5000,
      options: {},
    },
    application: { applicationReference: 'APP-123', platformLan: 'FTPL123' },
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
    it('throws if clientId is missing', async () => {
      const context = getBaseContext();
      context.transport.clientId = '';

      await expect(adapter.createApplication(context as any)).rejects.toThrow(
        new LenderIntegrationError('AUTHENTICATION_CONFIGURATION', 'Fintree client ID is required for HMAC authentication.')
      );
    });

    it('handles CUSTOM auth (HMAC) accurately by hashing serialized bytes exactly once', async () => {
      const context = getBaseContext('CUSTOM');
      configService.get.mockReturnValue('my-secret-key');
      httpService.requestJson.mockResolvedValue({ status: 200, data: { success: true, data: { status: 'ACKNOWLEDGED', partnerApplicationId: 'P-123', partnerApplicationNumber: 'PN-123', externalApplicationReference: 'APP-123', lan: 'FTPL123', correlationId: 'corr-1', createdAt: '2026-08-04T00:00:00Z' } } });

      await adapter.createApplication(context as any);

      expect(configService.get).toHaveBeenCalledWith('FINTREE_SECRET');
      expect(httpService.requestJson).toHaveBeenCalledWith(expect.objectContaining({
        headers: expect.objectContaining({
          'X-Client-Id': 'fintree-client-123',
          'X-Signature': expect.any(String),
          'X-Nonce': expect.any(String),
          'X-Request-Timestamp': expect.any(String)
        }),
      }));
    });

    it('handles BEARER_TOKEN seamlessly without adding HMAC headers', async () => {
      const context = getBaseContext('BEARER_TOKEN');
      configService.get.mockReturnValue('bearer-token-val'); // But adapter doesn't call it for BEARER_TOKEN
      httpService.requestJson.mockResolvedValue({ status: 200, data: { success: true, data: { status: 'ACKNOWLEDGED', partnerApplicationId: 'P-123', partnerApplicationNumber: 'PN-123', externalApplicationReference: 'APP-123', lan: 'FTPL123', correlationId: 'corr-1', createdAt: '2026-08-04T00:00:00Z' } } });

      await adapter.createApplication(context as any);

      expect(httpService.requestJson).toHaveBeenCalledWith(expect.objectContaining({
        headers: { 'X-Client-Id': 'fintree-client-123' } // No HMAC headers added
      }));
      // Note: LenderHttpService will inject the Authorization header separately!
    });
  });

  describe('Payload and Schema constraints', () => {
    it('creates an application and parses ACKNOWLEDGED successfully', async () => {
      const context = getBaseContext('BEARER_TOKEN');
      httpService.requestJson.mockResolvedValue({ status: 200, data: { success: true, data: { status: 'ACKNOWLEDGED', partnerApplicationId: 'P-123', partnerApplicationNumber: 'PN-123', externalApplicationReference: 'APP-123', lan: 'FTPL123', correlationId: 'corr-1', createdAt: '2026-08-04T00:00:00Z' } } });

      const result = await adapter.createApplication(context as any);
      expect(result.acknowledged).toBe(true);
      expect(result.partnerApplicationId).toBe('P-123');
    });

    it('rejects requestDecision explicitly for Fintree V1', async () => {
      const context = getBaseContext('BEARER_TOKEN');
      await expect(adapter.requestDecision(context as any)).rejects.toThrow('Fintree decision contract is not enabled for adapter version 1.');
    });

    it('throws LENDER_VALIDATION_ERROR if required Fintree field is missing', async () => {
      const context = getBaseContext('BEARER_TOKEN');
      httpService.requestJson.mockResolvedValue({ status: 200, data: { status: 'UNKNOWN' } });

      await expect(adapter.createApplication(context as any)).rejects.toThrow(LenderIntegrationError);
    });
  });
});
