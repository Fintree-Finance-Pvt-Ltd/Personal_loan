import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { ApplicationReminderStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StageReminderRedisService } from './stage-reminder-redis.service';
import { StageResolverService } from './stage-resolver.service';
import {
  STAGE_REMINDER_CONSTANTS,
  StageReminderJobPayload,
  buildReminderJobId,
} from './stage-reminder.types';

@Injectable()
export class StageReminderQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StageReminderQueueService.name);
  private queue: Queue | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly redisService: StageReminderRedisService,
    private readonly stageResolver: StageResolverService,
  ) {}

  onModuleInit(): void {
    try {
      const connection = this.redisService.getConnectionOptions();
      this.queue = new Queue(STAGE_REMINDER_CONSTANTS.QUEUE_NAME, {
        connection: connection as any,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      });

      this.logger.log(
        `BullMQ Queue '${STAGE_REMINDER_CONSTANTS.QUEUE_NAME}' initialized successfully.`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to initialize BullMQ Queue: ${err?.message}`, err?.stack);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.close();
      } catch (err: any) {
        this.logger.warn(`Error closing BullMQ Queue: ${err?.message}`);
      }
      this.queue = null;
    }
  }

  /**
   * Returns configured delay in ms for a given reminder number:
   *  - Reminder 1: 1 day after entering stage
   *  - Reminder 2: 1 day after Reminder 1 (next day)
   *  - Reminder 3, 4, 5 (Weekly 1, 2, 3): 7 days each
   */
  getReminderDelayMs(reminderNumber: number): number {
    const dayMs =
      Number(this.configService.get<number>('STAGE_REMINDER_DAY_MS')) ||
      STAGE_REMINDER_CONSTANTS.ONE_DAY_MS;
    const weekMs =
      Number(this.configService.get<number>('STAGE_REMINDER_WEEK_MS')) ||
      STAGE_REMINDER_CONSTANTS.SEVEN_DAYS_MS;

    if (reminderNumber <= 2) {
      return dayMs;
    }
    return weekMs;
  }

  /**
   * Schedules reminder 1 for an application at a specific stage.
   * Runs 1 day after the application enters / becomes stuck on this stage.
   */
  async scheduleFirstReminder(
    applicationId: bigint | number | string,
    stage: string,
  ): Promise<string | null> {
    const appIdBigInt = BigInt(applicationId);
    const delay = this.getReminderDelayMs(1);
    const scheduledAt = new Date(Date.now() + delay);
    const jobId = buildReminderJobId(appIdBigInt, stage, 1);

    // 1. Cancel any active reminders for previous stages of this application
    await this.cancelPreviousStageReminders(appIdBigInt, stage);

    // 2. Check if a reminder for this (appId + stage) already exists
    const existing = await this.prisma.plApplicationStageReminder.findUnique({
      where: {
        applicationId_stage: {
          applicationId: appIdBigInt,
          stage,
        },
      },
    });

    if (existing && existing.status === ApplicationReminderStatus.ACTIVE) {
      this.logger.debug(
        `Reminder for app #${applicationId} stage '${stage}' is already active. Skipping duplicate schedule.`,
      );
      return existing.lastJobId;
    }

    // 3. Upsert DB tracking record
    await this.prisma.plApplicationStageReminder.upsert({
      where: {
        applicationId_stage: {
          applicationId: appIdBigInt,
          stage,
        },
      },
      create: {
        applicationId: appIdBigInt,
        stage,
        stuckSince: new Date(),
        reminderCount: 0,
        weeklyReminderCount: 0,
        nextReminderDate: scheduledAt,
        status: ApplicationReminderStatus.ACTIVE,
        lastJobId: jobId,
      },
      update: {
        stuckSince: new Date(),
        reminderCount: 0,
        weeklyReminderCount: 0,
        nextReminderDate: scheduledAt,
        status: ApplicationReminderStatus.ACTIVE,
        lastJobId: jobId,
        stopReason: null,
      },
    });

    // 4. Enqueue BullMQ delayed job with deterministic jobId
    if (this.queue) {
      try {
        await this.queue.add(
          'send-stage-reminder',
          {
            applicationId: appIdBigInt.toString(),
            stage,
            reminderNumber: 1,
            scheduledAt: scheduledAt.toISOString(),
          },
          {
            jobId,
            delay,
          },
        );
        this.logger.log(
          `[BullMQ] Enqueued Reminder 1 for app #${applicationId} [stage: ${stage}] with delay ${delay}ms (jobId: ${jobId}).`,
        );
      } catch (err: any) {
        this.logger.error(`[BullMQ] Error adding job ${jobId}: ${err?.message}`);
      }
    }

    return jobId;
  }

  /**
   * Schedules the subsequent reminder (2, 3, 4, 5) for an application still stuck.
   */
  async scheduleNextReminder(
    applicationId: bigint | number | string,
    stage: string,
    nextReminderNumber: number,
  ): Promise<string | null> {
    if (nextReminderNumber > STAGE_REMINDER_CONSTANTS.MAX_TOTAL_REMINDERS) {
      this.logger.log(
        `[BullMQ] App #${applicationId} [stage: ${stage}] has reached max reminders (${STAGE_REMINDER_CONSTANTS.MAX_TOTAL_REMINDERS}). Stopping.`,
      );
      return null;
    }

    const appIdBigInt = BigInt(applicationId);
    const delay = this.getReminderDelayMs(nextReminderNumber);
    const nextReminderDate = new Date(Date.now() + delay);
    const jobId = buildReminderJobId(appIdBigInt, stage, nextReminderNumber);

    // Update next reminder date in DB
    await this.prisma.plApplicationStageReminder.update({
      where: {
        applicationId_stage: {
          applicationId: appIdBigInt,
          stage,
        },
      },
      data: {
        nextReminderDate,
        lastJobId: jobId,
      },
    });

    // Enqueue BullMQ delayed job
    if (this.queue) {
      try {
        await this.queue.add(
          'send-stage-reminder',
          {
            applicationId: appIdBigInt.toString(),
            stage,
            reminderNumber: nextReminderNumber,
            scheduledAt: nextReminderDate.toISOString(),
          },
          {
            jobId,
            delay,
          },
        );
        this.logger.log(
          `[BullMQ] Enqueued Reminder #${nextReminderNumber} for app #${applicationId} [stage: ${stage}] with delay ${delay}ms (jobId: ${jobId}).`,
        );
      } catch (err: any) {
        this.logger.error(`[BullMQ] Error adding job ${jobId}: ${err?.message}`);
      }
    }

    return jobId;
  }

  /**
   * Hook called whenever an application transitions to a new stage or reaches terminal status.
   */
  async onStageTransition(
    applicationId: bigint | number | string,
    newStageOrResolution?: string,
  ): Promise<void> {
    const appIdBigInt = BigInt(applicationId);

    const app = await this.prisma.plApplication.findUnique({
      where: { id: appIdBigInt },
      include: {
        customer: true,
        loans: { take: 1, orderBy: { id: 'desc' } },
      },
    });

    if (!app) return;

    const resolution = this.stageResolver.resolveStage(app);

    if (resolution.isTerminal) {
      // Mark all active reminders as TERMINAL_STATUS
      await this.prisma.plApplicationStageReminder.updateMany({
        where: {
          applicationId: appIdBigInt,
          status: ApplicationReminderStatus.ACTIVE,
        },
        data: {
          status: ApplicationReminderStatus.TERMINAL_STATUS,
          stopReason: resolution.terminalReason || 'Application reached terminal status',
          nextReminderDate: null,
        },
      });
      this.logger.log(
        `[StageTransition] App #${applicationId} reached terminal state (${resolution.stage}: ${resolution.terminalReason}). Stopped all reminders.`,
      );
      return;
    }

    const currentStage = newStageOrResolution || resolution.stage;

    // Cancel reminders for other stages
    await this.cancelPreviousStageReminders(appIdBigInt, currentStage);

    // Schedule reminder 1 for this new stage
    await this.scheduleFirstReminder(appIdBigInt, currentStage);
  }

  /**
   * Cancels active reminders for previous stages when an application moves forward.
   */
  private async cancelPreviousStageReminders(
    applicationId: bigint,
    currentStage: string,
  ): Promise<void> {
    const previousActive = await this.prisma.plApplicationStageReminder.findMany({
      where: {
        applicationId,
        stage: { not: currentStage },
        status: ApplicationReminderStatus.ACTIVE,
      },
    });

    for (const record of previousActive) {
      await this.prisma.plApplicationStageReminder.update({
        where: { id: record.id },
        data: {
          status: ApplicationReminderStatus.STAGE_CHANGED,
          stopReason: `Customer moved to stage '${currentStage}'`,
          nextReminderDate: null,
        },
      });

      // Remove from BullMQ queue if jobId is recorded
      if (record.lastJobId && this.queue) {
        try {
          const job = await this.queue.getJob(record.lastJobId);
          if (job) {
            await job.remove();
          }
        } catch {
          // Ignore queue remove errors
        }
      }
    }
  }

  /**
   * Scans applications in database and ensures all stuck applications have an active reminder scheduled.
   */
  async scanStuckApplications(): Promise<{ scanned: number; scheduled: number; skipped: number }> {
    const apps = await this.prisma.plApplication.findMany({
      where: {
        status: {
          notIn: ['PLATFORM_REJECTED', 'LENDER_REJECTED', 'LOAN_CLOSED'],
        },
      },
      include: {
        customer: true,
        loans: { take: 1, orderBy: { id: 'desc' } },
        stageReminders: {
          where: { status: ApplicationReminderStatus.ACTIVE },
        },
      },
      take: 200,
      orderBy: { updatedAt: 'asc' },
    });

    let scheduled = 0;
    let skipped = 0;

    for (const app of apps) {
      const resolution = this.stageResolver.resolveStage(app);
      if (resolution.isTerminal) {
        skipped++;
        continue;
      }

      const activeReminder = app.stageReminders.find((r) => r.stage === resolution.stage);
      if (activeReminder) {
        skipped++;
        continue;
      }

      await this.scheduleFirstReminder(app.id, resolution.stage);
      scheduled++;
    }

    this.logger.log(
      `[ScanStuck] Completed scan: scanned=${apps.length}, scheduled=${scheduled}, skipped=${skipped}`,
    );
    return { scanned: apps.length, scheduled, skipped };
  }

  /**
   * Daily cron sweep at 10:00 AM IST to enroll any stuck applications that are not yet tracked.
   */
  @Cron('0 0 10 * * *', { timeZone: 'Asia/Kolkata' })
  async cronScanStuckApplications(): Promise<void> {
    const enabled = this.configService.get<string>('STAGE_REMINDER_CRON_ENABLED') !== 'false';
    if (!enabled) return;
    try {
      await this.scanStuckApplications();
    } catch (err: any) {
      this.logger.error(`Error in cronScanStuckApplications: ${err?.message}`);
    }
  }
}
