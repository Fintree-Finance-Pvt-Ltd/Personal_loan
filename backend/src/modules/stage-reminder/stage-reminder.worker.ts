import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { ApplicationReminderStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import {
  WhatsAppEventType,
  WhatsAppTemplateName,
  WhatsAppTriggerSource,
} from '../integrations/whatsapp/whatsapp.types';
import { StageReminderRedisService } from './stage-reminder-redis.service';
import { StageResolverService } from './stage-resolver.service';
import { StageReminderQueueService } from './stage-reminder-queue.service';
import {
  STAGE_REMINDER_CONSTANTS,
  StageReminderJobPayload,
  getReminderTier,
} from './stage-reminder.types';

@Injectable()
export class StageReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StageReminderWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly redisService: StageReminderRedisService,
    private readonly stageResolver: StageResolverService,
    private readonly whatsappService: WhatsAppService,
    private readonly queueService: StageReminderQueueService,
  ) {}

  onModuleInit(): void {
    try {
      const connection = this.redisService.getConnectionOptions();
      this.worker = new Worker(
        STAGE_REMINDER_CONSTANTS.QUEUE_NAME,
        async (job: Job) => {
          return this.processJob(job as Job<StageReminderJobPayload>);
        },
        {
          connection: connection as any,
          concurrency: 5,
        },
      );

      this.worker.on('completed', (job) => {
        this.logger.debug(
          `[BullMQ Worker] Job ${job.id} for app #${job.data.applicationId} completed successfully.`,
        );
      });

      this.worker.on('failed', (job, err) => {
        this.logger.warn(
          `[BullMQ Worker] Job ${job?.id} failed: ${err?.message}`,
        );
      });

      this.logger.log(
        `BullMQ Worker for '${STAGE_REMINDER_CONSTANTS.QUEUE_NAME}' initialized successfully.`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to initialize BullMQ Worker: ${err?.message}`, err?.stack);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.close();
      } catch (err: any) {
        this.logger.warn(`Error closing BullMQ Worker: ${err?.message}`);
      }
      this.worker = null;
    }
  }

  /**
   * Processes a scheduled stage reminder job.
   */
  async processJob(job: Job<StageReminderJobPayload>): Promise<{
    status: string;
    messageSent: boolean;
    nextScheduled?: string | null;
  }> {
    const { applicationId, stage, reminderNumber } = job.data;
    const appIdBigInt = BigInt(applicationId);

    this.logger.log(
      `[BullMQ Worker] Processing reminder #${reminderNumber} for app #${applicationId} [expected stage: ${stage}]`,
    );

    // 1. Fetch the latest application status from the database
    const app = await this.prisma.plApplication.findUnique({
      where: { id: appIdBigInt },
      include: {
        customer: true,
        loans: { take: 1, orderBy: { id: 'desc' } },
      },
    });

    if (!app) {
      this.logger.warn(`[BullMQ Worker] Application #${applicationId} not found in database. Aborting.`);
      await this.markReminderStopped(appIdBigInt, stage, 'APPLICATION_NOT_FOUND', 'Application record not found');
      return { status: 'APPLICATION_NOT_FOUND', messageSent: false };
    }

    // 2. Resolve current stage and check if application has become terminal
    const resolution = this.stageResolver.resolveStage(app);

    if (resolution.isTerminal) {
      this.logger.log(
        `[BullMQ Worker] App #${applicationId} is in terminal status (${resolution.stage}: ${resolution.terminalReason}). Stopping reminders.`,
      );
      await this.markReminderStopped(
        appIdBigInt,
        stage,
        ApplicationReminderStatus.TERMINAL_STATUS,
        resolution.terminalReason || 'Application reached terminal status',
      );
      return { status: 'TERMINAL_STATUS', messageSent: false };
    }

    // 3. Confirm that the application is still stuck on the SAME stage
    if (resolution.stage !== stage) {
      this.logger.log(
        `[BullMQ Worker] App #${applicationId} is no longer on stage '${stage}' (now on '${resolution.stage}'). Ignoring reminder.`,
      );
      await this.markReminderStopped(
        appIdBigInt,
        stage,
        ApplicationReminderStatus.STAGE_CHANGED,
        `Customer progressed from '${stage}' to '${resolution.stage}'`,
      );
      return { status: 'STAGE_CHANGED', messageSent: false };
    }

    // 4. Determine reminder tier and weekly count
    const tier = getReminderTier(reminderNumber);
    const weeklyCount = reminderNumber >= 3 ? reminderNumber - 2 : 0;

    // 5. Send customized WhatsApp message for this tier
    const messageSent = await this.sendStageReminderWhatsApp({
      app,
      resolution,
      tier,
      reminderNumber,
      weeklyCount,
    });

    // 6. Update tracking fields in database
    const now = new Date();
    await this.prisma.plApplicationStageReminder.update({
      where: {
        applicationId_stage: {
          applicationId: appIdBigInt,
          stage,
        },
      },
      data: {
        reminderCount: reminderNumber,
        weeklyReminderCount: weeklyCount,
        lastReminderSentAt: now,
      },
    });

    // 7. Check if this was the 3rd weekly reminder (final reminder, #5 total)
    if (reminderNumber >= STAGE_REMINDER_CONSTANTS.MAX_TOTAL_REMINDERS) {
      this.logger.log(
        `[BullMQ Worker] App #${applicationId} completed 3rd weekly reminder (final reminder). Stopping all further messages.`,
      );
      await this.prisma.plApplicationStageReminder.update({
        where: {
          applicationId_stage: {
            applicationId: appIdBigInt,
            stage,
          },
        },
        data: {
          status: ApplicationReminderStatus.MAX_REACHED,
          stopReason: 'Maximum 3 weekly reminders completed',
          nextReminderDate: null,
        },
      });

      return { status: 'MAX_REACHED', messageSent };
    }

    // 8. Otherwise, schedule next reminder only if still required
    const nextJobId = await this.queueService.scheduleNextReminder(
      appIdBigInt,
      stage,
      reminderNumber + 1,
    );

    return {
      status: 'REMINDER_SENT_AND_NEXT_SCHEDULED',
      messageSent,
      nextScheduled: nextJobId,
    };
  }

  /**
   * Dispatches WhatsApp template message with content tailored to the reminder tier.
   */
  private async sendStageReminderWhatsApp(params: {
    app: any;
    resolution: any;
    tier: 'FIRST' | 'SECOND' | 'WEEKLY' | 'FINAL';
    reminderNumber: number;
    weeklyCount: number;
  }): Promise<boolean> {
    const { app, resolution, tier, reminderNumber, weeklyCount } = params;

    if (!resolution.customerMobile) {
      this.logger.warn(`Cannot send reminder for app #${app.id}: customer mobile missing.`);
      return false;
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'https://finle-prod.fintreelms.com';
    const appLink = `${frontendUrl}/customer/apply`;
    const customerName = this.whatsappService.formatCustomerName(resolution.customerName);
    const reference = resolution.reference || app.applicationNumber || `APP-${app.id}`;
    const stageTitle = resolution.stageDisplayName || 'Application Steps';

    // Tailor step message and select template for each tier
    let stepDescription: string;
    let templateName: string;

    switch (tier) {
      case 'FIRST':
        stepDescription = `${stageTitle} — Take the next step to get your loan disbursed.`;
        templateName =
          this.configService.get<string>('WHATSAPP_TEMPLATE_REMINDER_FIRST') ||
          WhatsAppTemplateName.APPLICATION_REMINDER_FIRST;
        break;

      case 'SECOND':
        stepDescription = `${stageTitle} — Reminder: Complete your pending step today in just 2 minutes.`;
        templateName =
          this.configService.get<string>('WHATSAPP_TEMPLATE_REMINDER_SECOND') ||
          WhatsAppTemplateName.APPLICATION_REMINDER_SECOND;
        break;

      case 'WEEKLY':
        stepDescription = `${stageTitle} — Weekly update (${weeklyCount} of 3): Your loan application is waiting for you.`;
        templateName =
          this.configService.get<string>('WHATSAPP_TEMPLATE_REMINDER_WEEKLY') ||
          WhatsAppTemplateName.APPLICATION_REMINDER_WEEKLY;
        break;

      case 'FINAL':
      default:
        stepDescription = `${stageTitle} — Final notice: Your approved loan offer will expire soon.`;
        templateName =
          this.configService.get<string>('WHATSAPP_TEMPLATE_REMINDER_FINAL') ||
          WhatsAppTemplateName.APPLICATION_REMINDER_FINAL;
        break;
    }

    // Attempt sending with dedicated reminder template; fall back to standard approved application_pending template
    const templatesToTry = [templateName, WhatsAppTemplateName.APPLICATION_PENDING];

    for (const tpl of templatesToTry) {
      try {
        const sendResult = await this.whatsappService.sendTemplateMessage({
          to: resolution.customerMobile,
          templateName: tpl,
          languageCode: 'en',
          bodyParameters: [customerName, stepDescription, appLink, reference],
          customerId: app.customerId,
          applicationId: app.id,
          lan: resolution.lan,
          eventType: WhatsAppEventType.APPLICATION_STAGE_REMINDER,
          triggerSource: WhatsAppTriggerSource.SYSTEM_AUTOMATION,
        });

        if (sendResult.success) {
          this.logger.log(
            `[StageReminder] Successfully sent ${tier} reminder (reminder #${reminderNumber}) for app #${app.id} using template '${tpl}'.`,
          );
          return true;
        }

        // If template doesn't exist on WABA, try the fallback application_pending template
        this.logger.warn(
          `[StageReminder] Sending with template '${tpl}' failed (${sendResult.errorMessage}). Trying fallback...`,
        );
      } catch (err: any) {
        this.logger.warn(`[StageReminder] Error sending template '${tpl}': ${err?.message}`);
      }
    }

    return false;
  }

  private async markReminderStopped(
    applicationId: bigint,
    stage: string,
    status: ApplicationReminderStatus | string,
    stopReason: string,
  ): Promise<void> {
    try {
      await this.prisma.plApplicationStageReminder.update({
        where: {
          applicationId_stage: {
            applicationId,
            stage,
          },
        },
        data: {
          status: status as ApplicationReminderStatus,
          stopReason,
          nextReminderDate: null,
        },
      });
    } catch {
      // Ignore if record doesn't exist
    }
  }
}
