import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ApplicationReminderStatus, PlApplicationStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StageReminderQueueService } from './stage-reminder-queue.service';
import { StageReminderRedisService } from './stage-reminder-redis.service';
import { StageResolverService } from './stage-resolver.service';
import { STAGE_REMINDER_CONSTANTS } from './stage-reminder.types';

describe('StageReminderQueueService', () => {
  let service: StageReminderQueueService;
  let mockPrisma: any;
  let mockQueue: any;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJob: jest.fn().mockResolvedValue(null),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      plApplication: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      plApplicationStageReminder: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 1n }),
        update: jest.fn().mockResolvedValue({ id: 1n }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StageReminderQueueService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'STAGE_REMINDER_DAY_MS') return undefined; // use default 1 day
              if (key === 'STAGE_REMINDER_WEEK_MS') return undefined; // use default 7 days
              return undefined;
            }),
          },
        },
        {
          provide: StageReminderRedisService,
          useValue: {
            getConnectionOptions: jest.fn().mockReturnValue({ host: '127.0.0.1', port: 6379 }),
          },
        },
        StageResolverService,
      ],
    }).compile();

    service = module.get<StageReminderQueueService>(StageReminderQueueService);
    // Inject mock queue directly
    (service as any).queue = mockQueue;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Delay Scheduling Rules', () => {
    it('returns 1 day for reminder 1 and reminder 2', () => {
      expect(service.getReminderDelayMs(1)).toBe(STAGE_REMINDER_CONSTANTS.ONE_DAY_MS);
      expect(service.getReminderDelayMs(2)).toBe(STAGE_REMINDER_CONSTANTS.ONE_DAY_MS);
    });

    it('returns 7 days for weekly reminders 3, 4, and 5', () => {
      expect(service.getReminderDelayMs(3)).toBe(STAGE_REMINDER_CONSTANTS.SEVEN_DAYS_MS);
      expect(service.getReminderDelayMs(4)).toBe(STAGE_REMINDER_CONSTANTS.SEVEN_DAYS_MS);
      expect(service.getReminderDelayMs(5)).toBe(STAGE_REMINDER_CONSTANTS.SEVEN_DAYS_MS);
    });
  });

  describe('scheduleFirstReminder', () => {
    it('creates DB record and enqueues delayed job with deterministic jobId', async () => {
      const jobId = await service.scheduleFirstReminder(101n, 'EMANDATE');

      expect(jobId).toBe('stage-reminder:101:EMANDATE:1');
      expect(mockPrisma.plApplicationStageReminder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            applicationId_stage: {
              applicationId: 101n,
              stage: 'EMANDATE',
            },
          },
          create: expect.objectContaining({
            applicationId: 101n,
            stage: 'EMANDATE',
            status: ApplicationReminderStatus.ACTIVE,
            lastJobId: 'stage-reminder:101:EMANDATE:1',
          }),
        }),
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-stage-reminder',
        expect.objectContaining({
          applicationId: '101',
          stage: 'EMANDATE',
          reminderNumber: 1,
        }),
        expect.objectContaining({
          jobId: 'stage-reminder:101:EMANDATE:1',
          delay: STAGE_REMINDER_CONSTANTS.ONE_DAY_MS,
        }),
      );
    });
  });

  describe('scheduleNextReminder', () => {
    it('enqueues reminder 2 with 1 day delay', async () => {
      const jobId = await service.scheduleNextReminder(101n, 'EMANDATE', 2);

      expect(jobId).toBe('stage-reminder:101:EMANDATE:2');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-stage-reminder',
        expect.objectContaining({
          applicationId: '101',
          stage: 'EMANDATE',
          reminderNumber: 2,
        }),
        expect.objectContaining({
          jobId: 'stage-reminder:101:EMANDATE:2',
          delay: STAGE_REMINDER_CONSTANTS.ONE_DAY_MS,
        }),
      );
    });

    it('enqueues reminder 3 (weekly 1) with 7 days delay', async () => {
      const jobId = await service.scheduleNextReminder(101n, 'EMANDATE', 3);

      expect(jobId).toBe('stage-reminder:101:EMANDATE:3');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-stage-reminder',
        expect.objectContaining({
          reminderNumber: 3,
        }),
        expect.objectContaining({
          jobId: 'stage-reminder:101:EMANDATE:3',
          delay: STAGE_REMINDER_CONSTANTS.SEVEN_DAYS_MS,
        }),
      );
    });

    it('returns null and does not enqueue if reminder number exceeds 5', async () => {
      const jobId = await service.scheduleNextReminder(101n, 'EMANDATE', 6);
      expect(jobId).toBeNull();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('onStageTransition', () => {
    it('marks all active reminders as TERMINAL_STATUS when application is rejected', async () => {
      mockPrisma.plApplication.findUnique.mockResolvedValue({
        id: 101n,
        status: PlApplicationStatus.PLATFORM_REJECTED,
        customer: { accountStatus: 'ACTIVE' },
      });

      await service.onStageTransition(101n);

      expect(mockPrisma.plApplicationStageReminder.updateMany).toHaveBeenCalledWith({
        where: {
          applicationId: 101n,
          status: ApplicationReminderStatus.ACTIVE,
        },
        data: expect.objectContaining({
          status: ApplicationReminderStatus.TERMINAL_STATUS,
        }),
      });
    });
  });
});
