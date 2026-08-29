import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IvrService } from './ivr.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { IvrCallType } from './ivr.types';

describe('IvrService', () => {
  let service: IvrService;
  let mockHttpClientPost: jest.Mock;

  const mockSecretKey = 'c7a1bd57bd090e3ba660e956ef148240e4b00addfdaf62f1b74bd2e043576f7';
  const mockAgentId = '6a72df43cb217d8c0bf8360e';

  beforeEach(async () => {
    mockHttpClientPost = jest.fn().mockResolvedValue({
      data: {
        success: true,
        callId: 'test-call-12345',
        status: 'queued',
      },
    });

    const mockPrisma = {
      plApplication: {
        findUnique: jest.fn().mockResolvedValue({
          id: 19n,
          applicationNumber: 'APP-FTPL00000019',
          platformLan: 'FTPL00000019',
          customer: {
            id: 19n,
            fullName: 'Test Customer',
            mobileNumber: '9876543210',
          },
          loans: [],
        }),
      },
      ivrCallLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IvrService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'IVR_AGENT_ID') return mockAgentId;
              if (key === 'IVR_SECRET_KEY') return mockSecretKey;
              return undefined;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<IvrService>(IvrService);
    (service as any).httpClient = {
      post: mockHttpClientPost,
      get: jest.fn(),
    };
  });

  it('should include secretKey, userMobileNo, phoneConfigId, and externalApi in makeCall request', async () => {
    const result = await service.makeCall({
      applicationId: 19n,
      callType: IvrCallType.DISBURSEMENT_CONFIRMATION,
    });

    expect(result.success).toBe(true);
    expect(result.callId).toBe('test-call-12345');

    expect(mockHttpClientPost).toHaveBeenCalledWith(
      '/calls/new',
      expect.objectContaining({
        to: '+919876543210',
        userMobileNo: '+919876543210',
        agentId: mockAgentId,
        phoneConfigId: mockAgentId,
        externalApi: true,
        secretKey: mockSecretKey,
        customData: expect.any(Object),
      }),
    );
  });
});
