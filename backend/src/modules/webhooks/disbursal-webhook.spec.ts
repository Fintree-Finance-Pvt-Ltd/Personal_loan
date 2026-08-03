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
    it('should process valid disbursal webhook without secret when DISBURSAL_WEBHOOK_SECRET is unconfigured', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockWebhooksService.processDisbursalWebhook.mockResolvedValue({
        success: true,
        status: 'DISBURSED',
        message: 'Disbursal processed and repayment schedule generated successfully',
        lan: 'LAN1785737725628',
        disbursalUtr: 'UTR123456789',
      });

      const payload = {
        lan: 'LAN1785737725628',
        DisbursalUTR: 'UTR123456789',
        DisbursalDate: '2026-08-03',
        DisbursedAmount: 50000,
        RepaymentDate: '2026-09-03',
        status: 'DISBURSED',
      };

      const req = { ip: '127.0.0.1', headers: {} } as any;

      const response = await controller.handleLenderDisbursalWebhook('FINTREE', payload, req);
      expect(response.success).toBe(true);
      expect(response.status).toBe('DISBURSED');
      expect(mockWebhooksService.processDisbursalWebhook).toHaveBeenCalledWith('FINTREE', payload, '127.0.0.1', '');
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

    it('should delegate repayment webhook to processRepaymentWebhook', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      (mockWebhooksService as any).processRepaymentWebhook = jest.fn().mockResolvedValue({
        success: true,
        message: 'Repayment of ₹50739.73 recorded successfully',
        paymentId: 'PAY123456',
      });

      const payload = { lan: 'LAN1785737725628', installmentNumber: 1, amount: 50739.73 };
      const req = { ip: '127.0.0.1', headers: {} } as any;

      const response = await controller.handleRepaymentWebhook(payload, req);
      expect(response.success).toBe(true);
      expect((mockWebhooksService as any).processRepaymentWebhook).toHaveBeenCalledWith(payload);
    });
  });
});
