import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { LoanService } from '../loan/loan.service';
import { ConfigService } from '@nestjs/config';

describe('EasyCollect Mandate Webhook Forwarding', () => {
  let controller: WebhooksController;
  let webhooksService: WebhooksService;
  let loanService: LoanService;

  beforeEach(() => {
    loanService = {
      handleEasebuzzMandateWebhook: jest.fn(),
      handleEasebuzzEasycollectMandateWebhook: jest.fn(),
      forwardToEasycollectMandateWebhook: jest.fn(),
    } as any;

    const plPaymentsService = { handleEasebuzzWebhook: jest.fn() } as any;
    webhooksService = new WebhooksService(loanService, plPaymentsService);
    controller = new WebhooksController(webhooksService, new ConfigService());
  });

  describe('GET /api/webhooks/easebuzz/easycollect/mandate', () => {
    it('should return reachability status for easycollect mandate probe', async () => {
      const result = await controller.handleEasebuzzEasycollectMandateProbe();
      expect(result).toEqual({
        success: true,
        message: 'Easebuzz EasyCollect mandate webhook endpoint is reachable. Use POST for actual webhook events.',
        path: '/api/webhooks/easebuzz/easycollect/mandate',
      });
    });
  });

  describe('POST /api/webhooks/easebuzz/easycollect/mandate', () => {
    it('should process easycollect mandate webhook', async () => {
      const payload = { transaction_id: 'EC_123456', status: 'success' };
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'Jest' } } as any;

      (loanService.handleEasebuzzEasycollectMandateWebhook as jest.Mock).mockResolvedValue({
        success: true,
        acknowledged: true,
        processed: true,
        route: '/api/webhooks/easebuzz/easycollect/mandate',
      });

      const result = await controller.handleEasebuzzEasycollectMandateWebhook(payload, req);

      expect(loanService.handleEasebuzzEasycollectMandateWebhook).toHaveBeenCalledWith(payload, {
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      });
      expect(result).toEqual({
        success: true,
        acknowledged: true,
        processed: true,
        route: '/api/webhooks/easebuzz/easycollect/mandate',
      });
    });
  });

  describe('LoanService PLM prefix filtering logic', () => {
    it('should identify non-PLM transaction ID and route to forwardToEasycollectMandateWebhook', async () => {
      const realLoanService = new LoanService(
        { plLoanMandate: { findFirst: jest.fn().mockResolvedValue(null) } } as any,
        {} as any,
        {} as any,
        {} as any,
        { sanitizeEasebuzzMandatePayload: jest.fn((p) => p), verifyEasebuzzMandateWebhookHash: jest.fn() } as any,
        { get: jest.fn() } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const forwardSpy = jest
        .spyOn(realLoanService, 'forwardToEasycollectMandateWebhook')
        .mockResolvedValue({ success: true, forwarded: true } as any);

      const nonPlmPayload = { transaction_id: 'NON_PLM_12345', status: 'authorized' };
      const res = await realLoanService.handleEasebuzzMandateWebhook(nonPlmPayload);

      expect(forwardSpy).toHaveBeenCalledWith(nonPlmPayload, undefined);
      expect(res).toEqual({ success: true, forwarded: true });
    });

    it('should process PLM prefixed transaction ID directly', async () => {
      const mockPrisma = {
        $transaction: jest.fn(async (cb) =>
          cb({
            plWebhookInbox: { create: jest.fn().mockResolvedValue({}) },
            plLoanMandate: { findFirst: jest.fn().mockResolvedValue(null) },
          }),
        ),
      };

      const realLoanService = new LoanService(
        mockPrisma as any,
        {} as any,
        {} as any,
        {} as any,
        { sanitizeEasebuzzMandatePayload: jest.fn((p) => p), verifyEasebuzzMandateWebhookHash: jest.fn() } as any,
        { get: jest.fn() } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const forwardSpy = jest.spyOn(realLoanService, 'forwardToEasycollectMandateWebhook');

      const plmPayload = { transaction_id: 'PLM_98765432', status: 'authorized' };
      const res = await realLoanService.handleEasebuzzMandateWebhook(plmPayload);

      expect(forwardSpy).not.toHaveBeenCalled();
      expect(res).toEqual({
        success: true,
        acknowledged: true,
        processed: false,
        reason: 'MANDATE_NOT_FOUND',
      });
    });
  });
});
