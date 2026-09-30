import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { LosRejectionWebhookService } from './los-rejection-webhook.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

describe('LosRejectionWebhookService', () => {
  let service: LosRejectionWebhookService;
  let httpService: { post: jest.Mock };
  let configService: { get: jest.Mock };
  let prismaService: any;

  beforeEach(async () => {
    httpService = {
      post: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'FINTREE_API_KEY') return 'test-api-key-12345';
        if (key === 'LMS_REJECTION_WEBHOOK_URL') return null;
        if (key === 'LMS_WEBHOOK_URL') return null;
        return null;
      }),
    };

    prismaService = {
      lenderIntegrationConfig: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cfg-1',
          lenderId: 'lender-1',
          baseUrl: 'https://finle-uat.fintreelms.com',
          webhookPath: '/api/partner/v1/webhook',
          authType: 'API_KEY',
          credentialSecretReference: 'FINTREE_API_KEY',
          isActive: true,
        }),
      },
      plApplication: {
        findUnique: jest.fn().mockResolvedValue({
          id: 43n,
          lenderId: 'lender-1',
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LosRejectionWebhookService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<LosRejectionWebhookService>(LosRejectionWebhookService);
  });

  it('sends rejection webhook with the required payload, URL and headers', async () => {
    httpService.post.mockReturnValue(of({ status: 200, data: { success: true } }));

    const result = await service.sendRejectionWebhook({
      lan: 'FTPL00000043',
      reason: 'Application did not meet lender criteria.',
      lenderId: 'lender-1',
      applicationId: 43n,
    });

    expect(result).toBe(true);
    expect(httpService.post).toHaveBeenCalledTimes(1);

    const [calledUrl, calledPayload, calledConfig] = httpService.post.mock.calls[0];
    expect(calledUrl).toBe('https://finle-uat.fintreelms.com/api/partner/v1/webhook');
    expect(calledPayload).toEqual(
      expect.objectContaining({
        lan: 'FTPL00000043',
        status: 'REJECTED',
        stage: 'LOS_REJECTED',
        message: 'Loan application rejected',
        reject_reason: 'Application did not meet lender criteria.',
        timestamp: expect.any(String),
      }),
    );
    expect(calledConfig.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Correlation-Id': expect.any(String),
        'Idempotency-Key': 'FTPL00000043:LOS_REJECTED',
        'x-api-key': 'test-api-key-12345',
      }),
    );
  });

  it('uses LMS_REJECTION_WEBHOOK_URL when defined in configuration', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'LMS_REJECTION_WEBHOOK_URL') return 'https://lms.fintree.com/webhook/rejection';
      if (key === 'FINTREE_API_KEY') return 'custom-secret';
      return null;
    });

    httpService.post.mockReturnValue(of({ status: 200, data: { success: true } }));

    const result = await service.sendRejectionWebhook({
      lan: 'FTPL00000044',
      reason: 'Credit review rejected: Insufficient income',
    });

    expect(result).toBe(true);
    const [calledUrl, , calledConfig] = httpService.post.mock.calls[0];
    expect(calledUrl).toBe('https://lms.fintree.com/webhook/rejection');
    expect(calledConfig.headers['x-api-key']).toBe('custom-secret');
  });

  it('is idempotent and skips sending duplicate rejection for the same LAN', async () => {
    httpService.post.mockReturnValue(of({ status: 200, data: { success: true } }));

    const res1 = await service.sendRejectionWebhook({
      lan: 'FTPL00000043',
      reason: 'Reason 1',
    });
    expect(res1).toBe(true);
    expect(httpService.post).toHaveBeenCalledTimes(1);

    const res2 = await service.sendRejectionWebhook({
      lan: 'FTPL00000043',
      reason: 'Reason 1 duplicate attempt',
    });
    expect(res2).toBe(true);
    // Still 1, did not fire again
    expect(httpService.post).toHaveBeenCalledTimes(1);
  });

  it('handles delivery failure gracefully without throwing exception', async () => {
    httpService.post.mockReturnValue(throwError(() => new Error('Connection timeout')));

    const result = await service.sendRejectionWebhook({
      lan: 'FTPL00000099',
      reason: 'Failed delivery test',
    });

    expect(result).toBe(false);
    expect(httpService.post).toHaveBeenCalled();
  });
});
