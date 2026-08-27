import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SmsService } from './sms.service';
import { SmsSendResult, SmsTemplateType } from './sms.types';

@Injectable()
export class SmsAutomationService {
  private readonly logger = new Logger(SmsAutomationService.name);

  // In-memory cooldown cache with timestamp expiry for fast and lightweight throttling
  private readonly cooldownCache = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {}

  /**
   * Check if automated SMS sending is globally enabled.
   */
  private isAutoSmsEnabled(): boolean {
    const enabled = this.configService.get<boolean>('SMS_AUTO_ENABLED');
    return enabled !== false;
  }

  /**
   * Check if current time in IST is within allowable business hours (09:00 - 20:00).
   */
  private isWithinMessagingHours(): boolean {
    const nowIstString = new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
    });
    const currentHour = new Date(nowIstString).getHours();
    return currentHour >= 9 && currentHour < 20;
  }

  /**
   * Checks cooldown map to prevent duplicate SMS within a cooldown window (in hours).
   */
  private isCooldownActive(key: string, cooldownHours: number = 24): boolean {
    const now = Date.now();
    const lastSent = this.cooldownCache.get(key);
    if (!lastSent) return false;

    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    if (now - lastSent < cooldownMs) {
      return true;
    }

    this.cooldownCache.delete(key);
    return false;
  }

  private setCooldown(key: string): void {
    this.cooldownCache.set(key, Date.now());

    // Clean up old entries if map grows
    if (this.cooldownCache.size > 2000) {
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      for (const [k, ts] of this.cooldownCache.entries()) {
        if (ts < cutoff) this.cooldownCache.delete(k);
      }
    }
  }

  /**
   * Derives human-friendly name of the pending step for an incomplete application.
   */
  derivePendingStepName(customer: any, app: any, loan: any): string {
    if (loan) {
      switch (loan.currentStep) {
        case 'APPROVAL_SUMMARY':
          return 'Loan Offer Acceptance';
        case 'DIGILOCKER_KYC':
          return 'Aadhaar DigiLocker KYC';
        case 'CURRENT_ADDRESS':
        case 'BANK_DETAILS':
        case 'KFS':
          return 'Bank & Address Verification';
        case 'MANDATE':
          return 'e-Mandate Setup';
        case 'ESIGN':
          return 'e-Sign Agreement';
        default:
          break;
      }
    }

    if (!customer?.panNumber || !customer?.panStatus) {
      return 'PAN Verification';
    }
    if (!customer?.employmentType || !customer?.monthlyIncome) {
      return 'Income & Employment Details';
    }
    if (!customer?.aadhaarNumber && !customer?.aadhaarVerified) {
      return 'ADHAR VERIFICATION';
    }

    return 'Application Verification';
  }

  /**
   * 1. Auto Trigger when a Loan is Approved (Template 1).
   */
  async triggerLoanApprovedSms(
    applicationId: bigint,
    lan?: string,
  ): Promise<SmsSendResult | null> {
    if (!this.isAutoSmsEnabled()) {
      this.logger.debug('[SMS Auto] Skipped loan approved SMS: SMS_AUTO_ENABLED is false.');
      return null;
    }

    const cooldownKey = `LOAN_APPROVED_${applicationId}`;
    if (this.isCooldownActive(cooldownKey, 24)) {
      this.logger.log(
        `[SMS Auto] Loan approval SMS already sent for application #${applicationId} in last 24h.`,
      );
      return null;
    }

    try {
      const application = await this.prisma.plApplication.findUnique({
        where: { id: applicationId },
        include: {
          customer: true,
          loans: { take: 1, orderBy: { id: 'desc' } },
        },
      });

      if (!application || !application.customer?.mobileNumber) {
        this.logger.warn(
          `[SMS Auto] Could not trigger Loan Approved SMS: application or mobile not found for #${applicationId}.`,
        );
        return null;
      }

      const activeLan =
        lan ||
        application.loans?.[0]?.lan ||
        application.platformLan ||
        application.applicationNumber ||
        `APP-${application.id}`;

      const approvedAmount =
        application.approvedAmount ||
        application.loans?.[0]?.approvedAmount ||
        application.requestedAmount ||
        0;

      const customerName =
        application.customer.fullName ||
        application.customer.firstName ||
        'Customer';

      const result = await this.smsService.sendLoanApprovedSms({
        mobile: application.customer.mobileNumber,
        customerName,
        approvedAmount: Number(approvedAmount),
        lan: activeLan,
        applicationId: application.id,
      });

      if (result.success) {
        this.setCooldown(cooldownKey);
      }

      return result;
    } catch (err: any) {
      this.logger.error(
        `[SMS Auto] Failed to trigger Loan Approved SMS for app #${applicationId}: ${err?.message}`,
      );
      return null;
    }
  }

  /**
   * 2. Auto Trigger when a Loan is Disbursed (Template 2).
   */
  async triggerLoanDisbursedSms(lan: string): Promise<SmsSendResult | null> {
    if (!this.isAutoSmsEnabled()) {
      this.logger.debug('[SMS Auto] Skipped disbursal SMS: SMS_AUTO_ENABLED is false.');
      return null;
    }

    const cooldownKey = `LOAN_DISBURSED_${lan}`;
    if (this.isCooldownActive(cooldownKey, 24)) {
      this.logger.log(
        `[SMS Auto] Disbursal SMS already sent for LAN ${lan} in last 24h.`,
      );
      return null;
    }

    try {
      const loan = await this.prisma.plLoan.findUnique({
        where: { lan },
        include: {
          customer: true,
        },
      });

      if (!loan || !loan.customer?.mobileNumber) {
        this.logger.warn(
          `[SMS Auto] Could not trigger Disbursal SMS: loan or mobile not found for LAN ${lan}.`,
        );
        return null;
      }

      const netDisbursalAmount =
        loan.disbursalAmount || loan.approvedAmount || 0;

      const customerName =
        loan.customer.fullName || loan.customer.firstName || 'Customer';

      const result = await this.smsService.sendLoanDisbursedSms({
        mobile: loan.customer.mobileNumber,
        customerName,
        disbursedAmount: Number(netDisbursalAmount),
        lan: loan.lan,
      });

      if (result.success) {
        this.setCooldown(cooldownKey);
      }

      return result;
    } catch (err: any) {
      this.logger.error(
        `[SMS Auto] Failed to trigger Disbursal SMS for LAN ${lan}: ${err?.message}`,
      );
      return null;
    }
  }

  /**
   * 5. Auto Trigger when a Loan is Fully Repaid / Closed (Template 5).
   * Congratulates the customer and invites them to apply for a repeat loan.
   */
  async triggerLoanFullyPaidSms(
    lan: string,
    eligibleRepeatAmount?: number | string,
  ): Promise<SmsSendResult | null> {
    if (!this.isAutoSmsEnabled()) {
      this.logger.debug('[SMS Auto] Skipped fully paid SMS: SMS_AUTO_ENABLED is false.');
      return null;
    }

    const cooldownKey = `LOAN_FULLY_PAID_${lan}`;
    if (this.isCooldownActive(cooldownKey, 24)) {
      this.logger.log(`[SMS Auto] Fully Paid SMS already sent for LAN ${lan} in last 24h.`);
      return null;
    }

    try {
      const loan = await this.prisma.plLoan.findUnique({
        where: { lan },
        include: {
          customer: true,
        },
      });

      if (!loan || !loan.customer?.mobileNumber) {
        this.logger.warn(
          `[SMS Auto] Could not trigger Fully Paid SMS: loan or customer not found for LAN ${lan}.`,
        );
        return null;
      }

      const customerName = loan.customer.fullName || loan.customer.firstName || 'Customer';
      const previousAmount = Number(loan.approvedAmount || 5000);
      const computedRepeatAmount = eligibleRepeatAmount || Math.round(previousAmount * 1.5) || 10000;

      const result = await this.smsService.sendLoanFullyPaidSms({
        mobile: loan.customer.mobileNumber,
        customerName,
        previousLan: loan.lan,
        eligibleAmount: computedRepeatAmount,
        customerId: loan.customerId,
      });

      if (result.success) {
        this.setCooldown(cooldownKey);
      }

      return result;
    } catch (err: any) {
      this.logger.error(`[SMS Auto] Failed to trigger Fully Paid SMS for LAN ${lan}: ${err?.message}`);
      return null;
    }
  }

  /**
   * 3. Daily Scheduled Job: Repayment / EMI Reminder (Template 3).
   * Runs daily at 10:00 AM IST.
   */
  @Cron('0 10 * * *', { timeZone: 'Asia/Kolkata' })
  async cronDueReminders(): Promise<void> {
    if (!this.isAutoSmsEnabled()) {
      return;
    }

    this.logger.log('[SMS Auto] Running Daily 1-Day-Before Due Date Repayment SMS Reminder Job...');

    try {
      // Look for schedules due tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

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

      this.logger.log(
        `[SMS Auto] Found ${pendingSchedules.length} pending schedules due tomorrow (${tomorrowStr}).`,
      );

      for (const schedule of pendingSchedules) {
        const lan = schedule.lan;
        const customer = schedule.loan?.customer;

        if (!customer?.mobileNumber) continue;

        const cooldownKey = `DUE_REMINDER_${lan}_${schedule.installmentNumber}`;
        if (this.isCooldownActive(cooldownKey, 24)) continue;

        const customerName = customer.fullName || customer.firstName || 'Customer';
        const amountDue = schedule.remainingAmount
          ? Number(schedule.remainingAmount)
          : Number(schedule.principal || 0) + Number(schedule.interest || 0);

        // Format Date as DD/MM/YYYY
        const d = new Date(schedule.dueDate);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const formattedDueDate = `${day}/${month}/${year}`;

        try {
          const result = await this.smsService.sendRepaymentReminderSms({
            mobile: customer.mobileNumber,
            customerName,
            amountDue,
            lan,
            dueDate: formattedDueDate,
          });

          if (result.success) {
            this.setCooldown(cooldownKey);
          }
        } catch (err: any) {
          this.logger.error(
            `[SMS Auto] Failed to send due reminder SMS for LAN ${lan}: ${err?.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`[SMS Auto] Error in cronDueReminders: ${err?.message}`, err?.stack);
    }
  }

  /**
   * 4. Scheduled Job: Stuck / Pending Step Application Follow-up (Template 4).
   * Runs every 15 minutes during business hours (09:00 - 20:00 IST).
   * - Sends when customer is stuck for >= 3 hours.
   * - Once successfully delivered, suppresses resending for 24 hours.
   * - If application remains pending after 24 hours, sends the follow-up again.
   */
  @Cron('*/15 * * * *', { timeZone: 'Asia/Kolkata' })
  async cronPendingStepFollowUp(): Promise<void> {
    if (!this.isAutoSmsEnabled() || !this.isWithinMessagingHours()) {
      return;
    }

    const stuckHoursThreshold = 3;
    const thresholdTime = new Date(Date.now() - stuckHoursThreshold * 60 * 60 * 1000);
    const maxLookbackDays = 30;
    const maxLookbackTime = new Date(Date.now() - maxLookbackDays * 24 * 60 * 60 * 1000);

    try {
      // Find active applications stuck for >= 3h (within last 30 days)
      const stuckApplications = await this.prisma.plApplication.findMany({
        where: {
          updatedAt: {
            lte: thresholdTime,
            gte: maxLookbackTime,
          },
          status: {
            notIn: ['PLATFORM_REJECTED', 'LENDER_REJECTED', 'LOAN_CLOSED'],
          },
        },
        include: {
          loans: {
            take: 1,
            orderBy: { id: 'desc' },
          },
        },
        take: 50,
      });

      if (stuckApplications.length === 0) return;

      const customerIds = Array.from(new Set(stuckApplications.map((a) => a.customerId)));
      const customers = await this.prisma.customer.findMany({
        where: { id: { in: customerIds } },
      });
      const customerMap = new Map(customers.map((c) => [c.id.toString(), c]));

      this.logger.log(
        `[SMS Auto] Checking ${stuckApplications.length} stuck applications for pending step SMS...`,
      );

      const processedCustomers = new Set<string>();

      for (const app of stuckApplications) {
        const customer = customerMap.get(app.customerId.toString());
        if (!customer || !customer.mobileNumber) continue;

        const customerIdStr = customer.id.toString();
        if (processedCustomers.has(customerIdStr)) {
          continue; // Already processed this customer in this cycle
        }

        const loan = app.loans?.[0];

        // Skip if already disbursed
        if (loan?.status === 'DISBURSED' || loan?.disbursalCompletedAt) {
          continue;
        }

        // Strict 24-hour cooldown per customer: Do not resend within 24h once delivered.
        // If customer is still pending after 24h, the cooldown expires and triggers again.
        const cooldownKey = `PENDING_STEP_CUST_${customer.id}`;
        if (this.isCooldownActive(cooldownKey, 24)) {
          continue;
        }

        const pendingStep = this.derivePendingStepName(customer, app, loan);
        const customerName = customer.fullName || customer.firstName || 'Customer';
        const applicationRef = app.applicationNumber || `APP-${app.id}`;

        this.logger.log(
          `[SMS Auto] Triggering pending step follow-up SMS for Customer #${customer.id} (${customerName}) on step '${pendingStep}'...`,
        );

        processedCustomers.add(customerIdStr);

        try {
          const result = await this.smsService.sendPendingStepSms({
            mobile: customer.mobileNumber,
            customerName,
            pendingStep,
            applicationRef,
          });

          if (result.success) {
            this.setCooldown(cooldownKey);
          }
        } catch (err: any) {
          this.logger.error(
            `[SMS Auto] Failed to send pending step SMS for app #${app.id}: ${err?.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(
        `[SMS Auto] Error in cronPendingStepFollowUp: ${err?.message}`,
        err?.stack,
      );
    }
  }
}
