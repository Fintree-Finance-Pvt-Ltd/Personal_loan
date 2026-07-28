import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { sanitizeDigitapPayload, normalizeDigitapStatus } from '../loan/digilocker-normalizer';

describe('Digitap Digilocker Webhook Integration', () => {
  let controller: WebhooksController;
  let service: WebhooksService;

  const mockWebhooksService = {
    processDigitapDigilockerWebhook: jest.fn(),
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

  describe('Sanitization & Normalization', () => {
    it('should sanitize sensitive base64 buffers and unmasked Aadhaar numbers', () => {
      const rawPayload = {
        transactionId: 'TX123456',
        data: {
          maskedAdharNumber: '123456789012',
          image: 'a'.repeat(100),
          pdfLink: 'b'.repeat(100),
          name: 'Jane Doe',
        },
      };

      const sanitized = sanitizeDigitapPayload(rawPayload);
      expect(sanitized.data.image).toBe('[REMOVED]');
      expect(sanitized.data.pdfLink).toBe('[REMOVED]');
      expect(sanitized.data.maskedAdharNumber).toBe('XXXXXXXX9012');
      expect(sanitized.data.name).toBe('Jane Doe');
    });

    it('should normalize different Digitap status representations correctly', () => {
      expect(normalizeDigitapStatus('Success')).toBe('VERIFIED');
      expect(normalizeDigitapStatus('s')).toBe('VERIFIED');
      expect(normalizeDigitapStatus('verified')).toBe('VERIFIED');
      expect(normalizeDigitapStatus('failure')).toBe('FAILED');
      expect(normalizeDigitapStatus('expired')).toBe('EXPIRED');
      expect(normalizeDigitapStatus('cancelled')).toBe('CANCELLED');
    });
  });

  describe('WebhooksController Status Policy', () => {
    it('should return HTTP 200 for successfully processed webhooks', async () => {
      mockWebhooksService.processDigitapDigilockerWebhook.mockResolvedValue({
        status: 'Success',
        acknowledged: true,
        processed: true,
        duplicate: false,
      });

      const req: any = { ip: '127.0.0.1', headers: {} };
      const res = await controller.handleDigitapDigilockerWebhook({ transactionId: 'TX100', status: 'Success' }, req);

      expect(res).toEqual({
        status: 'Success',
        acknowledged: true,
        processed: true,
        duplicate: false,
      });
    });

    it('should return HTTP 503 for temporary database or infrastructure failures', async () => {
      mockWebhooksService.processDigitapDigilockerWebhook.mockRejectedValue(
        new Error('Prisma connection timeout')
      );

      const req: any = { ip: '127.0.0.1', headers: {} };

      await expect(
        controller.handleDigitapDigilockerWebhook({ transactionId: 'TX100', status: 'Success' }, req)
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should return HTTP 200 acknowledged ignored for unhandled event errors', async () => {
      mockWebhooksService.processDigitapDigilockerWebhook.mockRejectedValue(
        new Error('Some non-retryable logical issue')
      );

      const req: any = { ip: '127.0.0.1', headers: {} };
      const res = await controller.handleDigitapDigilockerWebhook({ transactionId: 'TX999' }, req);

      expect(res).toEqual({
        status: 'Ignored',
        acknowledged: true,
        processed: false,
        reason: 'UNHANDLED_EVENT',
      });
    });
  });
});
