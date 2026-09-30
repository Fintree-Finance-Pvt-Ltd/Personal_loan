import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('Lender Rejection Webhook Integration', () => {
  let controller: WebhooksController;
  let service: WebhooksService;

  const mockWebhooksService = {
    processLenderRejectionWebhook: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: mockWebhooksService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
    service = module.get<WebhooksService>(WebhooksService);

    jest.clearAllMocks();
  });

  describe('Authentication & Route Handling', () => {
    it('should reject webhook when no secret is configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const payload = {
        lan: 'FTPL00000043',
        status: 'REJECTED',
        stage: 'LMS_REJECTED',
      };
      const req = { ip: '127.0.0.1', headers: {} } as any;

      await expect(controller.handleLenderRejectionWebhook('FFPL2026', payload, req)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockWebhooksService.processLenderRejectionWebhook).not.toHaveBeenCalled();
    });

    it('should reject webhook when incoming secret does not match', async () => {
      mockConfigService.get.mockImplementation((key) => {
        if (key === 'PLP_DISBURSAL_WEBHOOK_SECRET') return 'test-secret';
        return null;
      });

      const payload = { lan: 'FTPL00000043', status: 'REJECTED' };
      const req = { ip: '127.0.0.1', headers: { 'x-webhook-secret': 'wrong-secret' } } as any;

      await expect(controller.handleLenderRejectionWebhook('FFPL2026', payload, req)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockWebhooksService.processLenderRejectionWebhook).not.toHaveBeenCalled();
    });

    it('should accept webhook with x-webhook-secret matching PLP_DISBURSAL_WEBHOOK_SECRET', async () => {
      mockConfigService.get.mockImplementation((key) => {
        if (key === 'PLP_DISBURSAL_WEBHOOK_SECRET') return 'valid-secret-123';
        return null;
      });

      mockWebhooksService.processLenderRejectionWebhook.mockResolvedValue({
        success: true,
        status: 'REJECTED',
        message: 'Loan application successfully marked as rejected by LMS',
        lan: 'FTPL00000043',
        acknowledged: true,
      });

      const payload = {
        lan: 'FTPL00000043',
        status: 'REJECTED',
        stage: 'LMS_REJECTED',
        message: 'Loan application rejected by LMS',
        reject_reason: 'Bank verification failed (NAME_MISMATCH) / Credit review rejected',
        rejected_by: 'credit_manager@fintree.com',
        timestamp: '2026-09-30T06:48:19.490Z',
      };

      const req = { ip: '127.0.0.1', headers: { 'x-webhook-secret': 'valid-secret-123' } } as any;

      const response = await controller.handleLenderRejectionWebhook('FFPL2026', payload, req);
      expect(response.success).toBe(true);
      expect(response.status).toBe('REJECTED');
      expect(mockWebhooksService.processLenderRejectionWebhook).toHaveBeenCalledWith(
        'FFPL2026',
        payload,
        '127.0.0.1',
        '',
      );
    });

    it('should handle default rejection endpoint (/rejection) delegating with DEFAULT lenderCode', async () => {
      mockConfigService.get.mockImplementation((key) => {
        if (key === 'PLP_DISBURSAL_WEBHOOK_SECRET') return 'valid-secret-123';
        return null;
      });

      mockWebhooksService.processLenderRejectionWebhook.mockResolvedValue({
        success: true,
        status: 'REJECTED',
        lan: 'FTPL00000043',
        acknowledged: true,
      });

      const payload = {
        lan: 'FTPL00000043',
        status: 'REJECTED',
      };

      const req = { ip: '127.0.0.1', headers: { 'x-webhook-secret': 'valid-secret-123' } } as any;

      const response = await controller.handleDefaultRejectionWebhook(payload, req);
      expect(response.success).toBe(true);
      expect(mockWebhooksService.processLenderRejectionWebhook).toHaveBeenCalledWith(
        'DEFAULT',
        payload,
        '127.0.0.1',
        '',
      );
    });
  });
});
