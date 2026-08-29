import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { WhatsAppAutomationService } from './whatsapp-automation.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppMessageStatus, WhatsAppTemplateName } from './whatsapp.types';

describe('WhatsAppAutomationService', () => {
  let automationService: WhatsAppAutomationService;
  let mockWhatsappService: Partial<WhatsAppService>;
  let mockPrisma: any;

  beforeEach(async () => {
    mockWhatsappService = {
      formatCustomerName: jest.fn((name) => name || 'Customer'),
      formatAmount: jest.fn((amt) => `₹${Number(amt).toLocaleString('en-IN')}`),
      sendTemplateMessage: jest.fn().mockResolvedValue({
        success: true,
        status: WhatsAppMessageStatus.ACCEPTED,
        messageId: 'wamid.12345',
        recipientMobile: '919876543210',
        templateName: 'test',
      }),
    };

    mockPrisma = {
      plLoan: { findUnique: jest.fn() },
      plApplication: { findUnique: jest.fn(), findMany: jest.fn() },
      plRepaymentSchedule: { findUnique: jest.fn(), findMany: jest.fn() },
      mlmAllocationDecision: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppAutomationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'WHATSAPP_AUTO_ENABLED') return true;
              if (key === 'FRONTEND_URL') return 'https://finle-prod.fintreelms.com';
              return undefined;
            }),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsAppService, useValue: mockWhatsappService },
      ],
    }).compile();

    automationService = module.get<WhatsAppAutomationService>(WhatsAppAutomationService);
  });

  describe('triggerLoanFullyPaidWhatsApp', () => {
    it('TEST 5: should send fully_paid template when loan is FULLY_PAID and repeat eligibility exists', async () => {
      mockPrisma.plLoan.findUnique.mockResolvedValue({
        id: 1n,
        lan: 'FTPL00000018',
        status: 'FULLY_PAID',
        customerId: 10n,
        applicationId: 18n,
        customer: {
          id: 10n,
          fullName: 'Suresh Kumar',
          mobileNumber: '9876543210',
          repeatLoanEligibleAmount: 12000,
        },
        application: { status: 'LOAN_CLOSED' },
      });

      const result = await automationService.triggerLoanFullyPaidWhatsApp('FTPL00000018');

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(mockWhatsappService.sendTemplateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '9876543210',
          templateName: WhatsAppTemplateName.FULLY_PAID,
          bodyParameters: ['Suresh Kumar', '₹12,000'],
        }),
      );
    });

    it('TEST 6: should NOT send fully_paid when repeat eligibility does NOT exist', async () => {
      mockPrisma.plLoan.findUnique.mockResolvedValue({
        id: 1n,
        lan: 'FTPL00000018',
        status: 'FULLY_PAID',
        customerId: 10n,
        customer: {
          id: 10n,
          fullName: 'Suresh Kumar',
          mobileNumber: '9876543210',
          repeatLoanEligibleAmount: null,
        },
      });
      mockPrisma.mlmAllocationDecision.findFirst.mockResolvedValue(null);

      const result = await automationService.triggerLoanFullyPaidWhatsApp('FTPL00000018');

      expect(result).toBeNull();
      expect(mockWhatsappService.sendTemplateMessage).not.toHaveBeenCalled();
    });

    it('TEST 7: should NOT send fully_paid when loan is NOT in FULLY_PAID state', async () => {
      mockPrisma.plLoan.findUnique.mockResolvedValue({
        id: 1n,
        lan: 'FTPL00000018',
        status: 'DISBURSED',
        outstandingPrincipal: 5000,
        customerId: 10n,
        customer: {
          id: 10n,
          fullName: 'Suresh Kumar',
          mobileNumber: '9876543210',
          repeatLoanEligibleAmount: 12000,
        },
      });

      const result = await automationService.triggerLoanFullyPaidWhatsApp('FTPL00000018');

      expect(result).toBeNull();
      expect(mockWhatsappService.sendTemplateMessage).not.toHaveBeenCalled();
    });
  });

  describe('triggerLoanApprovedWhatsApp', () => {
    it('TEST 1: should send loan_approved template with customer name, amount, app link, and reference', async () => {
      mockPrisma.plApplication.findUnique.mockResolvedValue({
        id: 18n,
        applicationNumber: 'APP-18',
        platformLan: 'FTPL00000018',
        approvedAmount: 25000,
        customerId: 10n,
        customer: {
          id: 10n,
          fullName: 'Jane Doe',
          mobileNumber: '9876543210',
        },
        loans: [],
      });

      const result = await automationService.triggerLoanApprovedWhatsApp(18n, 'FTPL00000018');

      expect(result?.success).toBe(true);
      expect(mockWhatsappService.sendTemplateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '9876543210',
          templateName: WhatsAppTemplateName.LOAN_APPROVED,
          bodyParameters: [
            'Jane Doe',
            '₹25,000',
            'https://finle-prod.fintreelms.com/customer/dashboard',
            'FTPL00000018',
          ],
        }),
      );
    });
  });

  describe('triggerEmiDueReminderWhatsApp', () => {
    it('TEST 3: should send emi_due_reminder template with amount, LAN, and due date', async () => {
      mockPrisma.plRepaymentSchedule.findUnique.mockResolvedValue({
        id: 101n,
        emi: 3500,
        remainingAmount: 3500,
        dueDate: new Date('2026-09-05'),
        paymentStatus: 'PENDING',
        loan: {
          lan: 'FTPL00000018',
          customerId: 10n,
          applicationId: 18n,
          customer: {
            fullName: 'Jane Doe',
            mobileNumber: '9876543210',
          },
        },
      });

      const result = await automationService.triggerEmiDueReminderWhatsApp(101n);

      expect(result?.success).toBe(true);
      expect(mockWhatsappService.sendTemplateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '9876543210',
          templateName: WhatsAppTemplateName.EMI_DUE_REMINDER,
          bodyParameters: [
            'Jane Doe',
            '₹3,500',
            'FTPL00000018',
            expect.any(String),
          ],
        }),
      );
    });
  });

  describe('triggerPendingStepWhatsApp', () => {
    it('TEST 4: should send application_pending template with pending step name', async () => {
      mockPrisma.plApplication.findUnique.mockResolvedValue({
        id: 18n,
        applicationNumber: 'APP-18',
        platformLan: 'FTPL00000018',
        customerId: 10n,
        customer: {
          fullName: 'Jane Doe',
          mobileNumber: '9876543210',
          panNumber: 'ABCDE1234F',
          panStatus: 'VERIFIED',
          employmentType: 'SALARIED',
          monthlyIncome: 45000,
          aadhaarVerified: false,
        },
        loans: [],
      });

      const result = await automationService.triggerPendingStepWhatsApp(18n);

      expect(result?.success).toBe(true);
      expect(mockWhatsappService.sendTemplateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '9876543210',
          templateName: WhatsAppTemplateName.APPLICATION_PENDING,
          bodyParameters: [
            'Jane Doe',
            'Aadhaar Verification',
            'https://finle-prod.fintreelms.com/customer/apply',
            'FTPL00000018',
          ],
        }),
      );
    });
  });
});
