import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ApplicationReminderStatus, PlApplicationStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { StageReminderWorker } from './stage-reminder.worker';
import { StageReminderRedisService } from './stage-reminder-redis.service';
import { StageResolverService } from './stage-resolver.service';
import { StageReminderQueueService } from './stage-reminder-queue.service';

describe('StageReminderWorker', () => {
  let worker: StageReminderWorker;
  let mockPrisma: any;
  let mockWhatsappService: any;
  let mockQueueService: any;
  let mockStageResolver: any;

  beforeEach(async () => {
    mockPrisma = {
      plApplication: {
        findUnique: jest.fn(),
      },
      plApplicationStageReminder: {
        update: jest.fn().mockResolvedValue({ id: 1n }),
      },
    };

    mockWhatsappService = {
      sendTemplateMessage: jest.fn().mockResolvedValue({ success: true }),
      formatCustomerName: jest.fn((name) => name || 'Customer'),
    };

    mockQueueService = {
      scheduleNextReminder: jest.fn().mockResolvedValue('next-job-id'),
    };

    mockStageResolver = {
      resolveStage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StageReminderWorker,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
        {
          provide: StageReminderRedisService,
          useValue: {
            getConnectionOptions: jest.fn().mockReturnValue({ host: '127.0.0.1', port: 6379 }),
          },
        },
        {
          provide: StageResolverService,
          useValue: mockStageResolver,
        },
        {
          provide: WhatsAppService,
          useValue: mockWhatsappService,
        },
        {
          provide: StageReminderQueueService,
          useValue: mockQueueService,
        },
      ],
    }).compile();

    worker = module.get<StageReminderWorker>(StageReminderWorker);
  });

  it('should be defined', () => {
    expect(worker).toBeDefined();
  });

  describe('processJob', () => {
    it('aborts and marks TERMINAL_STATUS if application became terminal in DB', async () => {
      mockPrisma.plApplication.findUnique.mockResolvedValue({
        id: 101n,
        status: PlApplicationStatus.PLATFORM_REJECTED,
      });

      mockStageResolver.resolveStage.mockReturnValue({
        stage: 'PLATFORM_REJECTED',
        isTerminal: true,
        terminalReason: 'BRE rejected',
      });

      const res = await worker.processJob({
        data: {
          applicationId: '101',
          stage: 'DRAFT',
          reminderNumber: 1,
          scheduledAt: new Date().toISOString(),
        },
      } as any);

      expect(res.status).toBe('TERMINAL_STATUS');
      expect(res.messageSent).toBe(false);
      expect(mockWhatsappService.sendTemplateMessage).not.toHaveBeenCalled();
      expect(mockQueueService.scheduleNextReminder).not.toHaveBeenCalled();
      expect(mockPrisma.plApplicationStageReminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApplicationReminderStatus.TERMINAL_STATUS,
          }),
        }),
      );
    });

    it('aborts and marks STAGE_CHANGED if application moved to another stage', async () => {
      mockPrisma.plApplication.findUnique.mockResolvedValue({
        id: 101n,
        status: PlApplicationStatus.LENDER_APPROVED,
      });

      mockStageResolver.resolveStage.mockReturnValue({
        stage: 'ESIGN', // Current stage is ESIGN, but job was for EMANDATE
        isTerminal: false,
      });

      const res = await worker.processJob({
        data: {
          applicationId: '101',
          stage: 'EMANDATE',
          reminderNumber: 1,
          scheduledAt: new Date().toISOString(),
        },
      } as any);

      expect(res.status).toBe('STAGE_CHANGED');
      expect(res.messageSent).toBe(false);
      expect(mockWhatsappService.sendTemplateMessage).not.toHaveBeenCalled();
      expect(mockQueueService.scheduleNextReminder).not.toHaveBeenCalled();
    });

    it('sends WhatsApp and schedules Reminder 2 when still stuck on Reminder 1', async () => {
      mockPrisma.plApplication.findUnique.mockResolvedValue({
        id: 101n,
        customerId: 501n,
        status: PlApplicationStatus.LENDER_APPROVED,
      });

      mockStageResolver.resolveStage.mockReturnValue({
        stage: 'EMANDATE',
        stageDisplayName: 'e-Mandate Setup',
        isTerminal: false,
        customerMobile: '919876543210',
        customerName: 'Aarav Sharma',
        reference: 'FTPL001',
      });

      const res = await worker.processJob({
        data: {
          applicationId: '101',
          stage: 'EMANDATE',
          reminderNumber: 1,
          scheduledAt: new Date().toISOString(),
        },
      } as any);

      expect(res.status).toBe('REMINDER_SENT_AND_NEXT_SCHEDULED');
      expect(res.messageSent).toBe(true);
      expect(mockWhatsappService.sendTemplateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '919876543210',
          eventType: 'APPLICATION_STAGE_REMINDER',
        }),
      );
      // Scheduled next reminder (reminder #2)
      expect(mockQueueService.scheduleNextReminder).toHaveBeenCalledWith(101n, 'EMANDATE', 2);
    });

    it('sends final WhatsApp (weekly reminder 3, total #5) and stops all further reminders', async () => {
      mockPrisma.plApplication.findUnique.mockResolvedValue({
        id: 101n,
        customerId: 501n,
        status: PlApplicationStatus.LENDER_APPROVED,
      });

      mockStageResolver.resolveStage.mockReturnValue({
        stage: 'EMANDATE',
        stageDisplayName: 'e-Mandate Setup',
        isTerminal: false,
        customerMobile: '919876543210',
        customerName: 'Aarav Sharma',
        reference: 'FTPL001',
      });

      const res = await worker.processJob({
        data: {
          applicationId: '101',
          stage: 'EMANDATE',
          reminderNumber: 5, // 5th reminder = 3rd weekly reminder = final
          scheduledAt: new Date().toISOString(),
        },
      } as any);

      expect(res.status).toBe('MAX_REACHED');
      expect(res.messageSent).toBe(true);
      expect(mockWhatsappService.sendTemplateMessage).toHaveBeenCalled();
      // MUST NOT schedule another reminder
      expect(mockQueueService.scheduleNextReminder).not.toHaveBeenCalled();
      expect(mockPrisma.plApplicationStageReminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApplicationReminderStatus.MAX_REACHED,
            nextReminderDate: null,
          }),
        }),
      );
    });
  });
});
