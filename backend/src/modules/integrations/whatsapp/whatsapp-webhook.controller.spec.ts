import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppService } from './whatsapp.service';

describe('WhatsAppWebhookController', () => {
  let controller: WhatsAppWebhookController;
  let mockWhatsappService: Partial<WhatsAppService>;

  const mockVerifyToken = 'fintree_whatsapp_verify_token_2026';

  beforeEach(async () => {
    mockWhatsappService = {
      updateMessageStatus: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsAppWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'WHATSAPP_WEBHOOK_VERIFY_TOKEN') return mockVerifyToken;
              return undefined;
            }),
          },
        },
        { provide: WhatsAppService, useValue: mockWhatsappService },
      ],
    }).compile();

    controller = module.get<WhatsAppWebhookController>(WhatsAppWebhookController);
  });

  describe('GET Webhook Verification Challenge', () => {
    it('should return hub.challenge when verify token matches', () => {
      const challenge = 'test_challenge_123456';
      const result = controller.verifyWebhook('subscribe', mockVerifyToken, challenge);
      expect(result).toBe(challenge);
    });

    it('should throw ForbiddenException on token mismatch', () => {
      expect(() => {
        controller.verifyWebhook('subscribe', 'wrong_token', '123456');
      }).toThrow(ForbiddenException);
    });
  });

  describe('POST Webhook Events', () => {
    it('TEST 11, 12, 13: should process delivery/read/failed status updates and update DB record', async () => {
      const payload: any = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '2769475950109615',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '918355930723',
                    phone_number_id: '653172951223151',
                  },
                  statuses: [
                    {
                      id: 'wamid.HBgLMTE4Nzg1NzIyMzQxNRUCMR',
                      status: 'delivered',
                      timestamp: '1724918400',
                      recipient_id: '919876543210',
                    },
                    {
                      id: 'wamid.HBgLMTE4Nzg1NzIyMzQxNRUCMR',
                      status: 'read',
                      timestamp: '1724918500',
                      recipient_id: '919876543210',
                    },
                    {
                      id: 'wamid.FAILED_MSG_123',
                      status: 'failed',
                      timestamp: '1724918600',
                      recipient_id: '919876543210',
                      errors: [
                        {
                          code: 131026,
                          title: 'Message Undeliverable',
                          message: 'Receiver does not have WhatsApp active',
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = await controller.handleWebhook(payload);

      expect(result.status).toBe('SUCCESS');
      expect(result.processed).toBe(true);

      // Delivered status update
      expect(mockWhatsappService.updateMessageStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          providerMessageId: 'wamid.HBgLMTE4Nzg1NzIyMzQxNRUCMR',
          status: 'delivered',
        }),
      );

      // Read status update
      expect(mockWhatsappService.updateMessageStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          providerMessageId: 'wamid.HBgLMTE4Nzg1NzIyMzQxNRUCMR',
          status: 'read',
        }),
      );

      // Failed status update with error details
      expect(mockWhatsappService.updateMessageStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          providerMessageId: 'wamid.FAILED_MSG_123',
          status: 'failed',
          errorCode: '131026',
          errorMessage: 'Message Undeliverable',
        }),
      );
    });
  });
});
