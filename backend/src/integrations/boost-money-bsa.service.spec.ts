import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BoostMoneyBsaService } from './boost-money-bsa.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BoostMoneyBsaService', () => {
  let service: BoostMoneyBsaService;
  let prisma: any;
  let configService: any;
  let mockHttpClient: any;

  beforeEach(async () => {
    mockHttpClient = {
      post: jest.fn(),
    };
    (axios.create as jest.Mock).mockReturnValue(mockHttpClient);

    prisma = {
      customerBankStatementAnalysis: {
        create: jest.fn().mockImplementation((args) => Promise.resolve({ id: BigInt(101), ...args.data })),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'BSA_API_BASE_URL') return 'https://bsa-uat.boost.money';
        if (key === 'BSA_API_TOKEN') return 'test_bearer_token_123';
        if (key === 'BSA_HTTP_TIMEOUT_MS') return '30000';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoostMoneyBsaService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BoostMoneyBsaService>(BoostMoneyBsaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Test Case 1 & 2: AA Failed + Bank Statement Parser API Success', () => {
    it('should parse raw transactions successfully and return accountUID and jobId', async () => {
      const mockSuccessResponse = {
        data: {
          jobId: 'JOB_987654321',
          status: 'SUCCESS',
          accountUID: 'ACC_UID_ABC12345',
          parseStatus: 'SUCCESS',
          parseMessage: 'Bank statement parsed successfully',
        },
      };

      mockHttpClient.post.mockResolvedValueOnce({
        status: 200,
        data: mockSuccessResponse,
      });

      const result = await service.parseTransactions({
        fipId: 'HDFC-FIP',
        bankCode: 'HDFC',
        accounts: [
          {
            Transactions: [{ txnId: 'TXN1', amount: 5000, type: 'CREDIT' }],
            Summary: { currentBalance: 25000 },
            Profile: { holders: { type: 'SINGLE', holder: [{ name: 'John Doe' }] } },
          },
        ],
        customerId: BigInt(1),
        applicationId: BigInt(10),
        lan: 'PL-LAN-001',
        source: 'AA',
      });

      expect(result.success).toBe(true);
      expect(result.accountUID).toBe('ACC_UID_ABC12345');
      expect(result.jobId).toBe('JOB_987654321');
      expect(result.parseStatus).toBe('SUCCESS');
      expect(prisma.customerBankStatementAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: BigInt(1),
            lan: 'PL-LAN-001',
            accountUid: 'ACC_UID_ABC12345',
            parseStatus: 'SUCCESS',
          }),
        }),
      );
    });
  });

  describe('Test Case 3: AA Failed + Bank Statement Parsing Failed', () => {
    it('should capture failure reason properly when BSA returns failure', async () => {
      const mockFailureResponse = {
        data: {
          jobId: 'JOB_FAIL_001',
          status: 'FAILED',
          parseStatus: 'FAILED',
          parseMessage: 'Invalid statement format or missing transactions',
          errors: ['No valid transactions detected in statement'],
        },
      };

      mockHttpClient.post.mockResolvedValueOnce({
        status: 200,
        data: mockFailureResponse,
      });

      const result = await service.parseTransactions({
        fipId: 'HDFC-FIP',
        bankCode: 'HDFC',
        accounts: [],
        customerId: BigInt(1),
        applicationId: BigInt(10),
        lan: 'PL-LAN-001',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.parseMessage).toContain('Invalid statement format');
      expect(prisma.customerBankStatementAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parseStatus: 'FAILED',
          }),
        }),
      );
    });
  });

  describe('Test Case 4: Invalid Token Handling', () => {
    it('should log 401 unauthorized error and return failure when token is invalid or rejected', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'BSA_API_TOKEN') return 'invalid_token_123';
        if (key === 'BSA_CLIENT_ID') return '';
        if (key === 'BSA_CLIENT_SECRET') return '';
        return 'https://bsa.boost.money';
      });

      mockHttpClient.post.mockRejectedValue({
        response: {
          status: 401,
          data: {
            message: 'Unauthorized: Invalid bearer token provided',
            error: 'Unauthorized',
          },
        },
      });

      const result = await service.parseTransactions({
        fipId: 'HDFC-FIP',
        accounts: [],
        customerId: BigInt(1),
        lan: 'PL-LAN-001',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(prisma.customerBankStatementAnalysis.create).toHaveBeenCalled();
    });

    it('should handle missing token and credentials configuration gracefully', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'BSA_API_TOKEN') return '';
        if (key === 'BSA_CLIENT_ID') return '';
        if (key === 'BSA_CLIENT_SECRET') return '';
        return 'https://bsa.boost.money';
      });

      const result = await service.parseTransactions({
        fipId: 'HDFC-FIP',
        accounts: [],
        customerId: BigInt(1),
        lan: 'PL-LAN-001',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('not configured');
    });
  });

  describe('Test Case 6: Dynamic Client Credentials Login & Token Caching', () => {
    it('should dynamically login via POST /api/v1/client/login when BSA_API_TOKEN is not set', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'BSA_API_BASE_URL') return 'https://bsa.boost.money';
        if (key === 'BSA_CLIENT_ID') return 'fintree_finance_s7sw';
        if (key === 'BSA_CLIENT_SECRET') return 'AupOeSsgE4kE2PYgvPdyyYxJi5HibWMv';
        if (key === 'BSA_API_TOKEN') return '';
        return null;
      });

      // 1. Mock client login response
      mockHttpClient.post.mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'dynamic_jwt_token_xyz' },
      });

      // 2. Mock parse transactions response
      mockHttpClient.post.mockResolvedValueOnce({
        status: 200,
        data: {
          jobId: 'JOB_123',
          status: 'SUCCESS',
          accountUID: 'ACC_UID_DYNAMIC_123',
        },
      });

      const result = await service.parseTransactions({
        fipId: 'HDFC-FIP',
        accounts: [],
        customerId: BigInt(1),
        lan: 'PL-LAN-001',
      });

      expect(result.success).toBe(true);
      expect(result.accountUID).toBe('ACC_UID_DYNAMIC_123');
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://bsa.boost.money/api/v1/client/login',
        { clientId: 'fintree_finance_s7sw', clientSecret: 'AupOeSsgE4kE2PYgvPdyyYxJi5HibWMv' },
        expect.any(Object),
      );
    });
  });
});

