import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException, ConflictException } from '@nestjs/common';

describe('Disbursal Webhook Integration', () => {
  let controller: WebhooksController;
  let service: WebhooksService;

  const mockWebhooksService = {
    processDisbursalWebhook: jest.fn(),
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

  describe('Webhook Controller Authentication & Delegation', () => {
    it('should reject disbursal webhook when DISBURSAL_WEBHOOK_SECRET is unconfigured (fail closed, not open)', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const payload = {
        lan: 'LAN1785737725628',
        DisbursalUTR: 'UTR123456789',
        DisbursalDate: '2026-08-03',
        DisbursedAmount: 50000,
        RepaymentDate: '2026-09-03',
        status: 'DISBURSED',
      };

      const req = { ip: '127.0.0.1', headers: {} } as any;

      await expect(controller.handleLenderDisbursalWebhook('FINTREE', payload, req)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockWebhooksService.processDisbursalWebhook).not.toHaveBeenCalled();
    });

    it('should reject webhook request when configured secret does not match header', async () => {
      mockConfigService.get.mockReturnValue('SECRET123');
      const payload = { lan: 'LAN1785737725628' };
      const req = { ip: '127.0.0.1', headers: { 'x-webhook-secret': 'WRONG_SECRET' } } as any;

      await expect(controller.handleLenderDisbursalWebhook('FINTREE', payload, req)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should accept webhook request when header matches configured secret', async () => {
      mockConfigService.get.mockReturnValue('SECRET123');
      mockWebhooksService.processDisbursalWebhook.mockResolvedValue({ success: true });

      const payload = { lan: 'LAN1785737725628' };
      const req = { ip: '127.0.0.1', headers: { 'x-lender-webhook-secret': 'SECRET123' } } as any;

      const response = await controller.handleLenderDisbursalWebhook('FINTREE', payload, req);
      expect(response.success).toBe(true);
    });

    it('should reject repayment webhook when no secret is configured (fail closed, not open)', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      (mockWebhooksService as any).processRepaymentWebhook = jest.fn();

      const payload = { lan: 'LAN1785737725628', installmentNumber: 1, amount: 50739.73 };
      const req = { ip: '127.0.0.1', headers: {} } as any;

      await expect(controller.handleRepaymentWebhook(payload, req)).rejects.toThrow(UnauthorizedException);
      expect((mockWebhooksService as any).processRepaymentWebhook).not.toHaveBeenCalled();
    });

    it('should delegate repayment webhook to processRepaymentWebhook when the secret matches', async () => {
      mockConfigService.get.mockReturnValue('SECRET123');
      (mockWebhooksService as any).processRepaymentWebhook = jest.fn().mockResolvedValue({
        success: false,
        status: 'IGNORED',
        message: 'This endpoint no longer processes repayments directly. Repayments are credited only via the signature-verified Easebuzz webhook.',
      });

      const payload = { lan: 'LAN1785737725628', installmentNumber: 1, amount: 50739.73 };
      const req = { ip: '127.0.0.1', headers: { 'x-webhook-secret': 'SECRET123' } } as any;

      const response = await controller.handleRepaymentWebhook(payload, req);
      expect(response.success).toBe(false);
      expect((mockWebhooksService as any).processRepaymentWebhook).toHaveBeenCalledWith(payload);
    });
  });
});
