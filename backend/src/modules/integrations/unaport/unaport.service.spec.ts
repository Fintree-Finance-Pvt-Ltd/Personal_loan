import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UnaportService } from './unaport.service';
import { UnaportTokenService } from './unaport-token.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { LenderIntegrationOutboxService } from '../../lender-integrations/lender-integration-outbox.service';
import { BoostMoneyBsaService } from '../../../integrations/boost-money-bsa.service';

describe('UnaportService', () => {
  let service: UnaportService;
  let prisma: any;
  let tokenService: any;

  const mockConfig = {
    UNAPORT_PRODUCT_ID: '529684db-7241-44d7-95a3-fdc4ee9f8c11',
    UNAPORT_FIU_ID: 'UNACORES-FIU-UAT',
    UNAPORT_FI_TYPE: 'Deposits',
    UNAPORT_SDK_URL: 'https://sdk.sandbox.unaport.com/view',
    UNAPORT_BASE_URL: 'https://common.sandbox.unaport.com/api/v1',
  };

  beforeEach(async () => {
    prisma = {
      customer: {
        findUnique: jest.fn(),
      },
      plApplication: {
        findFirst: jest.fn(),
      },
      plLoan: {
        findFirst: jest.fn(),
      },
      customerAccountAggregatorRequest: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      customerBankAccountData: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      customerBankTransaction: {
        upsert: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    tokenService = {
      getValidTokens: jest.fn().mockResolvedValue({
        accessToken: 'mock_access_token_123',
        refreshToken: 'mock_refresh_token_456',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnaportService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (mockConfig as any)[key]),
          },
        },
        {
          provide: UnaportTokenService,
          useValue: tokenService,
        },
        {
          provide: LenderIntegrationOutboxService,
          useValue: { recordJourneyConsent: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: BoostMoneyBsaService,
          useValue: {
            parseTransactions: jest.fn().mockResolvedValue({
              success: true,
              accountUID: 'ACC_UID_TEST',
              status: 'SUCCESS',
            }),
            downloadFraudAnalyticsPdf: jest.fn().mockResolvedValue({ success: true }),
          },
        },
      ],
    }).compile();

    service = module.get<UnaportService>(UnaportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateAccountAggregator', () => {
    it('should throw ForbiddenException if customer does not own requested LAN', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: BigInt(1), mobileNumber: '9876543210' });
      prisma.plApplication.findFirst.mockResolvedValue(null);
      prisma.plLoan.findFirst.mockResolvedValue(null);

      await expect(
        service.initiateAccountAggregator(BigInt(1), 'PL-LAN-12345'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if customer mobile is invalid', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: BigInt(1), mobileNumber: '123' });
      prisma.plApplication.findFirst.mockResolvedValue({ id: BigInt(10), lan: 'PL-LAN-12345' });

      await expect(
        service.initiateAccountAggregator(BigInt(1), 'PL-LAN-12345'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should generate valid Base64 SDK config URL on initiation', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: BigInt(1), mobileNumber: '9876543210' });
      prisma.plApplication.findFirst.mockResolvedValue({ id: BigInt(10), lan: 'PL-LAN-12345' });
      prisma.customerAccountAggregatorRequest.findFirst.mockResolvedValue(null);
      prisma.customerAccountAggregatorRequest.upsert.mockResolvedValue({
        id: BigInt(100),
        status: 'INITIATED',
      });

      const result = await service.initiateAccountAggregator(BigInt(1), 'PL-LAN-12345');

      expect(result.status).toBe('INITIATED');
      expect(result.trackingId).toContain('PL-AA-PL-LAN-12345');
      expect(result.sdkUrl).toContain('https://sdk.sandbox.unaport.com/view?config=');

      // Verify base64 decodes back to expected JSON
      const urlParams = new URL(result.sdkUrl).searchParams;
      const encodedConfig = urlParams.get('config');
      expect(encodedConfig).toBeDefined();

      const decodedString = Buffer.from(encodedConfig!, 'base64').toString('utf8');
      const decodedJson = JSON.parse(decodedString);

      expect(decodedJson.phoneNumber).toBe('9876543210');
      expect(decodedJson.productId).toBe('529684db-7241-44d7-95a3-fdc4ee9f8c11');
      expect(decodedJson.fiuId).toBe('UNACORES-FIU-UAT');
      expect(decodedJson.accessToken).toBe('mock_access_token_123');
      expect(decodedJson.refreshToken).toBe('mock_refresh_token_456');
    });
  });

  describe('handleConsentNotification', () => {
    it('should update request status to CONSENT_APPROVED on ACTIVE consent webhook', async () => {
      prisma.customerAccountAggregatorRequest.findFirst.mockResolvedValue({
        id: BigInt(100),
        customerId: BigInt(1),
        lan: 'PL-LAN-12345',
        trackingId: 'PL-AA-123',
        status: 'INITIATED',
      });
      prisma.customerAccountAggregatorRequest.update.mockResolvedValue({});

      const payload = {
        ver: '2.0.0',
        trackingId: 'PL-AA-123',
        ConsentStatusNotification: {
          consentId: 'cid_999',
          consentHandle: 'chandle_888',
          consentStatus: 'ACTIVE',
        },
      };

      const res = await service.handleConsentNotification(payload);

      expect(res.success).toBe(true);
      expect(prisma.customerAccountAggregatorRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(100) },
          data: expect.objectContaining({
            consentId: 'cid_999',
            consentStatus: 'APPROVED',
            status: 'CONSENT_APPROVED',
          }),
        }),
      );
    });

    it('should update request status to FAILED on REJECTED consent webhook', async () => {
      prisma.customerAccountAggregatorRequest.findFirst.mockResolvedValue({
        id: BigInt(100),
        customerId: BigInt(1),
        lan: 'PL-LAN-12345',
        trackingId: 'PL-AA-123',
        status: 'INITIATED',
      });
      prisma.customerAccountAggregatorRequest.update.mockResolvedValue({});

      const payload = {
        ver: '2.0.0',
        trackingId: 'PL-AA-123',
        ConsentStatusNotification: {
          consentId: null,
          consentHandle: 'chandle_888',
          consentStatus: 'REJECTED',
        },
      };

      const res = await service.handleConsentNotification(payload);

      expect(res.success).toBe(true);
      expect(prisma.customerAccountAggregatorRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(100) },
          data: expect.objectContaining({
            consentStatus: 'REJECTED',
            status: 'FAILED',
          }),
        }),
      );
    });
  });

  describe('executeBankStatementAnalysisFallback', () => {
    it('should trigger BSA fallback and update request to SUCCESS when BSA succeeds', async () => {
      prisma.customerBankAccountData.findFirst.mockResolvedValue({
        id: BigInt(201),
        currentBalance: 50000,
        transactions: [],
      });
      prisma.customerAccountAggregatorRequest.update.mockResolvedValue({});

      const req = {
        id: BigInt(100),
        customerId: BigInt(1),
        applicationId: BigInt(10),
        lan: 'PL-LAN-12345',
      };

      const result = await service.executeBankStatementAnalysisFallback(req);

      expect(result.success).toBe(true);
      expect(result.accountUID).toBe('ACC_UID_TEST');
      expect(prisma.customerAccountAggregatorRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(100) },
          data: expect.objectContaining({
            status: 'SUCCESS',
            dataStatus: 'BSA_VERIFIED',
          }),
        }),
      );
    });
  });
});

