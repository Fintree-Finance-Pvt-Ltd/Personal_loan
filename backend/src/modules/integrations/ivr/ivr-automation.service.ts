import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { IvrService } from './ivr.service';
import { IvrCallType, IvrTriggerSource } from './ivr.types';

@Injectable()
export class IvrAutomationService {
  private readonly logger = new Logger(IvrAutomationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly ivrService: IvrService,
  ) {}

  /**
   * Helper to check if automated IVR calling is globally enabled.
   */
  private isAutoCallsEnabled(): boolean {
    const enabled = this.configService.get<boolean>('IVR_AUTO_CALLS_ENABLED');
    return enabled !== false;
  }

  /**
   * Helper to verify if the current time in IST falls within allowed outbound calling hours (e.g. 09:00 - 20:00).
   */
  private isWithinCallingHours(): boolean {
    const startHour = this.configService.get<number>('IVR_CALLING_START_HOUR') ?? 9;
    const endHour = this.configService.get<number>('IVR_CALLING_END_HOUR') ?? 20;

    // Get current hour in Asia/Kolkata
    const nowIstString = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
    const currentHour = new Date(nowIstString).getHours();

    return currentHour >= startHour && currentHour < endHour;
  }

  /**
   * Checks if an IVR call was already triggered for this target within a cooldown window (in hours).
   */
  private async isCallOnCooldown(params: {
    applicationId?: bigint;
    lan?: string;
    callType?: IvrCallType;
    cooldownHours?: number;
  }): Promise<boolean> {
    const { applicationId, lan, callType, cooldownHours = 12 } = params;
    const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

    try {
      if (applicationId && callType) {
        const count = await this.prisma.ivrCallLog.count({
          where: {
            applicationId,
            callType: callType as any,
            createdAt: { gte: since },
          },
        });
        return count > 0;
      }

      if (applicationId) {
        const count = await this.prisma.ivrCallLog.count({
          where: {
            applicationId,
            createdAt: { gte: since },
          },
        });
        return count > 0;
      }

      if (lan && callType) {
        const count = await this.prisma.ivrCallLog.count({
          where: {
            lan,
            callType: callType as any,
            createdAt: { gte: since },
          },
        });
        return count > 0;
      }

      if (lan) {
        const count = await this.prisma.ivrCallLog.count({
          where: {
            lan,
            createdAt: { gte: since },
          },
        });
        return count > 0;
      }
    } catch (err: any) {
      this.logger.warn(`Failed to check IVR call cooldown: ${err?.message}`);
    }

    return false;
  }

  /**
   * 1. Auto Trigger when a Loan is Approved.
   */
  async triggerLoanApprovedCall(applicationId: bigint, lan?: string): Promise<void> {
    if (!this.isAutoCallsEnabled()) return;

    try {
      const onCooldown = await this.isCallOnCooldown({
        applicationId,
        lan,
        callType: IvrCallType.LOAN_APPROVAL,
        cooldownHours: 24,
      });

      if (onCooldown) {
        this.logger.log(`Loan approval IVR call already made for application #${applicationId} within last 24h.`);
        return;
      }

      this.logger.log(`[Auto-IVR] Triggering Loan Approval call for application #${applicationId}...`);
      await this.ivrService.makeCall({
        applicationId,
        lan,
        callType: IvrCallType.LOAN_APPROVAL,
        triggerSource: IvrTriggerSource.SYSTEM,
      });
    } catch (err: any) {
      this.logger.error(`[Auto-IVR] Failed to trigger loan approval call for app #${applicationId}: ${err?.message}`);
    }
  }

  /**
   * 2. Auto Trigger when a Loan is Disbursed.
   */
  async triggerLoanDisbursedCall(lan: string): Promise<void> {
    if (!this.isAutoCallsEnabled()) return;

    try {
      const onCooldown = await this.isCallOnCooldown({
        lan,
        callType: IvrCallType.DISBURSEMENT_CONFIRMATION,
        cooldownHours: 24,
      });

      if (onCooldown) {
        this.logger.log(`Disbursement IVR call already made for loan ${lan} within last 24h.`);
        return;
      }

      this.logger.log(`[Auto-IVR] Triggering Disbursement Confirmation call for loan ${lan}...`);
      await this.ivrService.makeCall({
        lan,
        callType: IvrCallType.DISBURSEMENT_CONFIRMATION,
        triggerSource: IvrTriggerSource.SYSTEM,
      });
    } catch (err: any) {
      this.logger.error(`[Auto-IVR] Failed to trigger disbursal call for loan ${lan}: ${err?.message}`);
    }
  }

  /**
   * Auto Trigger when Customer has Fully Paid their Loan (TP-06: Repeat Loan Offer).
   */
  async triggerLoanFullyPaidRepeatOfferCall(lan: string, applicationId?: bigint): Promise<void> {
    if (!this.isAutoCallsEnabled()) return;

    try {
      const onCooldown = await this.isCallOnCooldown({
        lan,
        callType: IvrCallType.REPEAT_LOAN_OFFER,
        cooldownHours: 24,
      });

      if (onCooldown) {
        this.logger.log(`Repeat loan offer IVR call already made for loan ${lan} within last 24h.`);
        return;
      }

      this.logger.log(`[Auto-IVR] Triggering Fully Paid Repeat Loan Offer (TP-06) call for loan ${lan}...`);
      await this.ivrService.makeCall({
        lan,
        applicationId,
        callType: IvrCallType.REPEAT_LOAN_OFFER,
        triggerSource: IvrTriggerSource.SYSTEM,
      });
    } catch (err: any) {
      this.logger.error(`[Auto-IVR] Failed to trigger repeat loan offer call for loan ${lan}: ${err?.message}`);
    }
  }

  /**
   * 3. Auto Trigger One Day Before Loan Due Date (EMI Reminder).
   * Runs daily at 10:00 AM IST.
   */
  @Cron('0 10 * * *', { timeZone: 'Asia/Kolkata' })
  async cronDueReminders(): Promise<void> {
    if (!this.isAutoCallsEnabled()) {
      this.logger.debug('[Auto-IVR] Due reminder cron skipped: automated IVR calls disabled.');
      return;
    }

    if (!this.isWithinCallingHours()) {
      this.logger.debug('[Auto-IVR] Due reminder cron skipped: outside allowed calling hours.');
      return;
    }

    this.logger.log('[Auto-IVR] Running Daily 1-Day-Before Due Date EMI Reminder Job...');

    try {
      // Calculate tomorrow's date string YYYY-MM-DD in Asia/Kolkata
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      // Find pending repayment schedules due tomorrow
      const pendingSchedules = await this.prisma.plRepaymentSchedule.findMany({
        where: {
          paymentStatus: 'PENDING',
          dueDate: new Date(tomorrowStr),
          loan: {
            status: { in: ['DISBURSED', 'LENDER_APPROVED'] },
          },
        },
        include: {
          loan: {
            include: { customer: true },
          },
        },
      });

      this.logger.log(`[Auto-IVR] Found ${pendingSchedules.length} pending installments due tomorrow (${tomorrowStr}).`);

      for (const schedule of pendingSchedules) {
        try {
          const onCooldown = await this.isCallOnCooldown({
            lan: schedule.lan,
            callType: IvrCallType.EMI_REMINDER,
            cooldownHours: 24,
          });

          if (onCooldown) {
            continue;
          }

          this.logger.log(`[Auto-IVR] Triggering EMI reminder call for LAN ${schedule.lan} (Instalment #${schedule.installmentNumber})...`);
          await this.ivrService.makeCall({
            lan: schedule.lan,
            customerId: schedule.loan.customerId,
            callType: IvrCallType.EMI_REMINDER,
            triggerSource: IvrTriggerSource.SYSTEM,
          });
        } catch (callErr: any) {
          this.logger.error(`[Auto-IVR] Failed to send due reminder for LAN ${schedule.lan}: ${callErr?.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`[Auto-IVR] Error in cronDueReminders: ${err?.message}`, err?.stack);
    }
  }

  /**
   * 4. Auto Trigger when Customer is Stuck on Any Step for 3 to 4 Hours.
   * Runs every 15 minutes during calling hours.
   */
  @Cron('*/15 * * * *', { timeZone: 'Asia/Kolkata' })
  async cronStuckCustomerFollowUp(): Promise<void> {
    if (!this.isAutoCallsEnabled()) {
      return;
    }

    if (!this.isWithinCallingHours()) {
      return;
    }

    const stuckHoursThreshold = this.configService.get<number>('IVR_STUCK_HOURS_THRESHOLD') ?? 3;
    const cooldownHours = this.configService.get<number>('IVR_COOLDOWN_HOURS') ?? 12;

    const thresholdTime = new Date(Date.now() - stuckHoursThreshold * 60 * 60 * 1000);
    const maxLookbackTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Only look back within last 24h

    try {
      // Find active applications where updatedAt is between 3 and 24 hours ago
      const stuckApplications = await this.prisma.plApplication.findMany({
        where: {
          updatedAt: {
            lte: thresholdTime,
            gte: maxLookbackTime,
          },
          status: {
            notIn: [
              'PLATFORM_REJECTED',
              'LENDER_REJECTED',
              'LOAN_CLOSED',
            ],
          },
        },
        include: {
          customer: true,
          loans: {
            take: 1,
            orderBy: { id: 'desc' },
          },
        },
        take: 30, // Batch limit per cycle
      });

      if (stuckApplications.length === 0) {
        return;
      }

      this.logger.log(`[Auto-IVR] Found ${stuckApplications.length} applications stuck for >= ${stuckHoursThreshold} hours.`);

      for (const app of stuckApplications) {
        const loan = app.loans?.[0];

        // If the loan is already disbursed, skip
        if (loan?.status === 'DISBURSED' || loan?.disbursalCompletedAt) {
          continue;
        }

        // Check if on cooldown
        const onCooldown = await this.isCallOnCooldown({
          applicationId: app.id,
          cooldownHours,
        });

        if (onCooldown) {
          continue;
        }

        // Determine specific touchpoint based on what step the customer is on
        const pendingStep = this.ivrService.deriveCustomerPendingStep(app.customer, app, loan);
        const callType = pendingStep.suggestedCallType;

        try {
          this.logger.log(
            `[Auto-IVR] Triggering Stuck Follow-up call for app #${app.id} (${app.applicationNumber}) on step #${pendingStep.stepNumber} '${pendingStep.stepName}' (Type: ${callType})...`,
          );

          await this.ivrService.makeCall({
            applicationId: app.id,
            lan: loan?.lan,
            callType,
            triggerSource: IvrTriggerSource.SYSTEM,
          });
        } catch (callErr: any) {
          this.logger.error(`[Auto-IVR] Failed stuck follow-up call for app #${app.id}: ${callErr?.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`[Auto-IVR] Error in cronStuckCustomerFollowUp: ${err?.message}`, err?.stack);
    }
  }
}
