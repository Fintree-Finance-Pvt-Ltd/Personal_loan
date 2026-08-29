import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';
import {
  WhatsAppMessageStatus,
  WhatsAppTemplateName,
} from './whatsapp.types';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let mockHttpClientPost: jest.Mock;
  let mockPrisma: any;

  const mockAccessToken = 'MOCK_WHATSAPP_ACCESS_TOKEN_ABC123';
  const mockPhoneNumberId = '653172951223151';

  beforeEach(async () => {
    mockHttpClientPost = jest.fn().mockResolvedValue({
      data: {
        messaging_product: 'whatsapp',
        contacts: [{ input: '919876543210', wa_id: '919876543210' }],
        messages: [{ id: 'wamid.HBgLMTE4Nzg1NzIyMzQxNRUCMR' }],
      },
    });

    mockPrisma = {
      plWhatsappMessageLog: {
        create: jest.fn().mockResolvedValue({ id: 1n }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'WHATSAPP_API_BASE_URL') return 'https://alots.io';
              if (key === 'WHATSAPP_API_VERSION') return 'v23.0';
              if (key === 'WHATSAPP_PHONE_NUMBER_ID') return mockPhoneNumberId;
              if (key === 'WHATSAPP_ACCESS_TOKEN') return mockAccessToken;
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

    service = module.get<WhatsAppService>(WhatsAppService);
    (service as any).httpClient = {
      post: mockHttpClientPost,
      get: jest.fn(),
    };
  });

  describe('normalizeMobileNumber', () => {
    it('should normalize 10-digit number to 91XXXXXXXXXX', () => {
      expect(service.normalizeMobileNumber('9876543210')).toBe('919876543210');
    });

    it('should normalize +91 formatted number', () => {
      expect(service.normalizeMobileNumber('+919876543210')).toBe('919876543210');
    });

    it('should normalize 0 prefixed number', () => {
      expect(service.normalizeMobileNumber('09876543210')).toBe('919876543210');
    });

    it('should normalize already 91 prefixed 12-digit number', () => {
      expect(service.normalizeMobileNumber('919876543210')).toBe('919876543210');
    });

    it('should throw BadRequestException on invalid mobile numbers', () => {
      expect(() => service.normalizeMobileNumber('12345')).toThrow();
      expect(() => service.normalizeMobileNumber('')).toThrow();
      expect(() => service.normalizeMobileNumber(null)).toThrow();
    });
  });

  describe('sendTemplateMessage - loan_approved', () => {
    it('should construct correct payload and call Alots.io endpoint with Bearer token', async () => {
      const result = await service.sendTemplateMessage({
        to: '9876543210',
        templateName: WhatsAppTemplateName.LOAN_APPROVED,
        bodyParameters: ['John Doe', '₹25,000', 'https://finle-prod.fintreelms.com/apply', 'FTPL00000018'],
        lan: 'FTPL00000018',
        applicationId: 18n,
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('wamid.HBgLMTE4Nzg1NzIyMzQxNRUCMR');
      expect(result.status).toBe(WhatsAppMessageStatus.ACCEPTED);

      expect(mockHttpClientPost).toHaveBeenCalledWith(
        '/v23.0/653172951223151/messages',
        expect.objectContaining({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: '919876543210',
          type: 'template',
          template: {
            name: 'loan_approved',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: 'John Doe' },
                  { type: 'text', text: '₹25,000' },
                  { type: 'text', text: 'https://finle-prod.fintreelms.com/apply' },
                  { type: 'text', text: 'FTPL00000018' },
                ],
              },
            ],
          },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockAccessToken}`,
          }),
        }),
      );

      expect(mockPrisma.plWhatsappMessageLog.create).toHaveBeenCalled();
    });
  });

  describe('sendTemplateMessage - loan_disbursed (with Header Document)', () => {
    it('should include document header component in payload', async () => {
      const docLink = 'https://finle-prod.fintreelms.com/api/documents/signed/doc123';
      const result = await service.sendTemplateMessage({
        to: '+919876543210',
        templateName: WhatsAppTemplateName.LOAN_DISBURSED,
        headerDocument: {
          link: docLink,
          filename: 'Sanction_Letter_FTPL00000018.pdf',
        },
        bodyParameters: ['John Doe', '₹25,000', 'FTPL00000018'],
        lan: 'FTPL00000018',
      });

      expect(result.success).toBe(true);
      expect(mockHttpClientPost).toHaveBeenCalledWith(
        '/v23.0/653172951223151/messages',
        expect.objectContaining({
          template: expect.objectContaining({
            name: 'loan_disbursed',
            components: [
              {
                type: 'header',
                parameters: [
                  {
                    type: 'document',
                    document: {
                      link: docLink,
                      filename: 'Sanction_Letter_FTPL00000018.pdf',
                    },
                  },
                ],
              },
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: 'John Doe' },
                  { type: 'text', text: '₹25,000' },
                  { type: 'text', text: 'FTPL00000018' },
                ],
              },
            ],
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('sendTemplateMessage - Error Handling', () => {
    it('should handle provider 400 error safely without crashing', async () => {
      mockHttpClientPost.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: {
              message: 'Invalid template name',
              code: 100,
            },
          },
        },
      });

      const result = await service.sendTemplateMessage({
        to: '9876543210',
        templateName: 'invalid_template',
        bodyParameters: ['test'],
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(WhatsAppMessageStatus.FAILED);
      expect(result.errorCode).toBe('100');
      expect(result.errorMessage).toBe('Invalid template name');
      expect(mockPrisma.plWhatsappMessageLog.create).toHaveBeenCalled();
    });
  });
});
