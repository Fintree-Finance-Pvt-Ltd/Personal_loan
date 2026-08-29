import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { signDocumentUrl } from '../../../common/utils/document-url-signer.helper';
import { WhatsAppService } from './whatsapp.service';
import {
  WhatsAppEventType,
  WhatsAppSendResult,
  WhatsAppTemplateName,
  WhatsAppTriggerSource,
} from './whatsapp.types';

@Injectable()
export class WhatsAppAutomationService {
  private readonly logger = new Logger(WhatsAppAutomationService.name);

  // In-memory cooldown cache for event deduplication
  private readonly cooldownCache = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  /**
   * Check if automated WhatsApp sending is globally enabled.
   */
  private isAutoWhatsAppEnabled(): boolean {
    const enabled = this.configService.get<boolean>('WHATSAPP_AUTO_ENABLED');
    return enabled !== false;
  }

  /**
   * Check if current time in IST is within allowable business hours (09:00 - 20:00).
   */
  private isWithinMessagingHours(): boolean {
    const startHour = this.configService.get<number>('WHATSAPP_START_HOUR') ?? 9;
    const endHour = this.configService.get<number>('WHATSAPP_END_HOUR') ?? 20;

    const nowIstString = new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
    });
    const currentHour = new Date(nowIstString).getHours();
    return currentHour >= startHour && currentHour < endHour;
  }

  /**
   * Checks cooldown map to prevent duplicate messages within a cooldown window (in hours).
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

    // Prune cache if it grows large
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
      return 'Aadhaar Verification';
    }
    if (!app || app.status === 'DRAFT') {
      return 'Application Details Submission';
    }

    return 'Application Next Step';
  }

  /**
   * Formats ISO date to readable string (e.g. "05 Sep 2026").
   */
  private formatDate(date: Date | string | null | undefined): string {
    if (!date) return '-';
    try {
      const d = new Date(date);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return String(date);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EVENT 1: LOAN APPROVED
  // ───────────────────────────────────────────────────────────────────────────
  async triggerLoanApprovedWhatsApp(
    applicationId: bigint | number | string,
    lan?: string,
    triggerSource: WhatsAppTriggerSource = WhatsAppTriggerSource.SYSTEM_AUTOMATION,
  ): Promise<WhatsAppSendResult | null> {
    if (!this.isAutoWhatsAppEnabled()) return null;

    const cooldownKey = `APPROVED_${applicationId}`;
    if (this.isCooldownActive(cooldownKey, 24)) {
      this.logger.log(`WhatsApp for loan approval app #${applicationId} suppressed by cooldown.`);
      return null;
    }

    const app = await this.prisma.plApplication.findUnique({
      where: { id: BigInt(applicationId) },
      include: {
        customer: true,
        loans: { take: 1, orderBy: { id: 'desc' } },
      },
    });

    if (!app || !app.customer?.mobileNumber) {
      this.logger.warn(`Cannot send approved WhatsApp: application or customer mobile missing (#${applicationId})`);
      return null;
    }

    const customerName = this.whatsappService.formatCustomerName(app.customer.fullName);
    const approvedAmount = this.whatsappService.formatAmount(
      app.selectedAmount || app.approvedAmount || app.loans?.[0]?.approvedAmount || 0,
    );
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://finle-prod.fintreelms.com';
    const appLink = `${frontendUrl}/customer/dashboard`;
    const reference = lan || app.platformLan || app.applicationNumber;

    const result = await this.whatsappService.sendTemplateMessage({
      to: app.customer.mobileNumber,
      templateName: WhatsAppTemplateName.LOAN_APPROVED,
      languageCode: 'en',
      bodyParameters: [customerName, approvedAmount, appLink, reference],
      customerId: app.customerId,
      applicationId: app.id,
      lan: lan || app.platformLan || undefined,
      eventType: WhatsAppEventType.LOAN_APPROVED,
      triggerSource,
    });

    if (result.success) {
      this.setCooldown(cooldownKey);
    }

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EVENT 2: LOAN DISBURSED
  // ───────────────────────────────────────────────────────────────────────────
  async triggerLoanDisbursedWhatsApp(
    lan: string,
    triggerSource: WhatsAppTriggerSource = WhatsAppTriggerSource.SYSTEM_AUTOMATION,
  ): Promise<WhatsAppSendResult | null> {
    if (!this.isAutoWhatsAppEnabled()) return null;

    const cleanLan = String(lan).trim();
    const cooldownKey = `DISBURSED_${cleanLan}`;
    if (this.isCooldownActive(cooldownKey, 48)) {
      this.logger.log(`WhatsApp for loan disbursed ${cleanLan} suppressed by cooldown.`);
      return null;
    }

    const loan = await this.prisma.plLoan.findUnique({
      where: { lan: cleanLan },
      include: {
        customer: true,
        application: {
          include: {
            documents: {
              orderBy: { id: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!loan || !loan.customer?.mobileNumber) {
      this.logger.warn(`Cannot send disbursed WhatsApp: loan or customer mobile missing for ${cleanLan}`);
      return null;
    }

    const customerName = this.whatsappService.formatCustomerName(loan.customer.fullName);
    const disbursedAmount = this.whatsappService.formatAmount(
      loan.disbursalAmount || loan.approvedAmount || 0,
    );

    // Resolve document URL if available
    let headerDocument: { link?: string; filename?: string } | undefined;
    const doc = loan.application?.documents?.[0];
    if (doc?.fileUrl) {
      const signedUrl = signDocumentUrl(doc.fileUrl);
      if (signedUrl) {
        headerDocument = {
          link: signedUrl,
          filename: `Sanction_Letter_${cleanLan}.pdf`,
        };
      }
    }

    const result = await this.whatsappService.sendTemplateMessage({
      to: loan.customer.mobileNumber,
      templateName: WhatsAppTemplateName.LOAN_DISBURSED,
      languageCode: 'en',
      headerDocument,
      bodyParameters: [customerName, disbursedAmount, cleanLan],
      customerId: loan.customerId,
      applicationId: loan.applicationId,
      lan: cleanLan,
      eventType: WhatsAppEventType.LOAN_DISBURSED,
      triggerSource,
    });

    if (result.success) {
      this.setCooldown(cooldownKey);
    }

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EVENT 3: FULLY PAID (REPEAT LOAN OFFER)
  // ───────────────────────────────────────────────────────────────────────────
  async triggerLoanFullyPaidWhatsApp(
    lan: string,
    applicationId?: bigint | number | string,
    triggerSource: WhatsAppTriggerSource = WhatsAppTriggerSource.SYSTEM_AUTOMATION,
  ): Promise<WhatsAppSendResult | null> {
    if (!this.isAutoWhatsAppEnabled()) return null;

    const cleanLan = String(lan).trim();
    const cooldownKey = `FULLY_PAID_${cleanLan}`;
    if (this.isCooldownActive(cooldownKey, 72)) {
      this.logger.log(`WhatsApp for fully paid loan ${cleanLan} suppressed by cooldown.`);
      return null;
    }

    const loan = await this.prisma.plLoan.findUnique({
      where: { lan: cleanLan },
      include: {
        customer: true,
        application: true,
      },
    });

    if (!loan) {
      this.logger.warn(`Cannot send fully_paid WhatsApp: loan ${cleanLan} not found.`);
      return null;
    }

    // STRICT CHECK: Loan must be in fully paid / closed state
    const isFullyPaid =
      loan.status === 'FULLY_PAID' ||
      loan.application?.status === 'LOAN_CLOSED';

    if (!isFullyPaid) {
      this.logger.warn(`Cannot send fully_paid WhatsApp: loan ${cleanLan} is not in FULLY_PAID state (status: ${loan.status}).`);
      return null;
    }

    // STRICT CHECK: Determine repeat loan eligibility from DB/BRE
    let repeatAmountNum: number | null = null;

    // 1. Check explicit customer repeat limit
    if ((loan.customer as any)?.repeatLoanEligibleAmount) {
      repeatAmountNum = Number((loan.customer as any).repeatLoanEligibleAmount);
    }

    // 2. Fallback to default repeat offer amount if configured in system
    if (!repeatAmountNum || repeatAmountNum <= 0) {
      const defaultRepeat = this.configService.get<number>('IVR_REPEAT_LOAN_DEFAULT_AMOUNT') ||
        this.configService.get<number>('WHATSAPP_REPEAT_LOAN_DEFAULT_AMOUNT');
      if (defaultRepeat && defaultRepeat > 0) {
        repeatAmountNum = Number(defaultRepeat);
      }
    }

    // If still no repeat eligible amount confirmed by DB/system, DO NOT SEND
    if (!repeatAmountNum || repeatAmountNum <= 0) {
      this.logger.warn(`Skipping fully_paid WhatsApp for loan ${cleanLan}: No repeat-loan eligible amount found in DB.`);
      return null;
    }

    if (!loan.customer?.mobileNumber) {
      this.logger.warn(`Cannot send fully_paid WhatsApp: customer mobile missing for ${cleanLan}`);
      return null;
    }

    const customerName = this.whatsappService.formatCustomerName(loan.customer.fullName);
    const repeatAmountStr = this.whatsappService.formatAmount(repeatAmountNum);

    const result = await this.whatsappService.sendTemplateMessage({
      to: loan.customer.mobileNumber,
      templateName: WhatsAppTemplateName.FULLY_PAID,
      languageCode: 'en',
      bodyParameters: [customerName, repeatAmountStr],
      customerId: loan.customerId,
      applicationId: loan.applicationId || (applicationId ? BigInt(applicationId) : undefined),
      lan: cleanLan,
      eventType: WhatsAppEventType.FULLY_PAID,
      triggerSource,
    });

    if (result.success) {
      this.setCooldown(cooldownKey);
    }

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EVENT 4: EMI DUE REMINDER
  // ───────────────────────────────────────────────────────────────────────────
  async triggerEmiDueReminderWhatsApp(
    installmentId: bigint | number | string,
    triggerSource: WhatsAppTriggerSource = WhatsAppTriggerSource.SYSTEM_AUTOMATION,
  ): Promise<WhatsAppSendResult | null> {
    if (!this.isAutoWhatsAppEnabled()) return null;

    const cooldownKey = `EMI_DUE_${installmentId}`;
    if (this.isCooldownActive(cooldownKey, 20)) {
      return null;
    }

    const schedule = await this.prisma.plRepaymentSchedule.findUnique({
      where: { id: BigInt(installmentId) },
      include: {
        loan: {
          include: {
            customer: true,
          },
        },
      },
    });

    if (!schedule || !schedule.loan || !schedule.loan.customer?.mobileNumber) {
      return null;
    }

    if (schedule.paymentStatus === 'PAID' || schedule.paymentStatus === 'WAIVED') {
      return null;
    }

    const customerName = this.whatsappService.formatCustomerName(schedule.loan.customer.fullName);
    const dueAmount = this.whatsappService.formatAmount(
      schedule.remainingAmount != null && Number(schedule.remainingAmount) > 0
        ? schedule.remainingAmount
        : schedule.emi,
    );
    const lan = schedule.loan.lan;
    const dueDateStr = this.formatDate(schedule.dueDate);

    const result = await this.whatsappService.sendTemplateMessage({
      to: schedule.loan.customer.mobileNumber,
      templateName: WhatsAppTemplateName.EMI_DUE_REMINDER,
      languageCode: 'en',
      bodyParameters: [customerName, dueAmount, lan, dueDateStr],
      customerId: schedule.loan.customerId,
      applicationId: schedule.loan.applicationId,
      lan,
      eventType: WhatsAppEventType.EMI_DUE,
      triggerSource,
    });

    if (result.success) {
      this.setCooldown(cooldownKey);
    }

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EVENT 5: APPLICATION PENDING STEP NUDGE
  // ───────────────────────────────────────────────────────────────────────────
  async triggerPendingStepWhatsApp(
    applicationId: bigint | number | string,
    triggerSource: WhatsAppTriggerSource = WhatsAppTriggerSource.SYSTEM_AUTOMATION,
  ): Promise<WhatsAppSendResult | null> {
    if (!this.isAutoWhatsAppEnabled()) return null;

    const cooldownKey = `PENDING_${applicationId}`;
    if (this.isCooldownActive(cooldownKey, 24)) {
      return null;
    }

    const app = await this.prisma.plApplication.findUnique({
      where: { id: BigInt(applicationId) },
      include: {
        customer: true,
        loans: { take: 1, orderBy: { id: 'desc' } },
      },
    });

    if (!app || !app.customer?.mobileNumber) {
      return null;
    }

    const customerName = this.whatsappService.formatCustomerName(app.customer.fullName);
    const pendingStep = this.derivePendingStepName(app.customer, app, app.loans?.[0]);
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://finle-prod.fintreelms.com';
    const appLink = `${frontendUrl}/customer/apply`;
    const reference = app.platformLan || app.applicationNumber;

    const result = await this.whatsappService.sendTemplateMessage({
      to: app.customer.mobileNumber,
      templateName: WhatsAppTemplateName.APPLICATION_PENDING,
      languageCode: 'en',
      bodyParameters: [customerName, pendingStep, appLink, reference],
      customerId: app.customerId,
      applicationId: app.id,
      lan: app.platformLan || undefined,
      eventType: WhatsAppEventType.APPLICATION_PENDING,
      triggerSource,
    });

    if (result.success) {
      this.setCooldown(cooldownKey);
    }

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SCHEDULED AUTOMATION CRONS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Daily cron job at 09:45 AM IST to notify customers of upcoming EMI dues (T-3, T-1, T-0).
   */
  @Cron('0 45 9 * * *')
  async cronDueReminders(): Promise<void> {
    if (!this.isAutoWhatsAppEnabled() || !this.isWithinMessagingHours()) return;

    this.logger.log('Starting automated daily WhatsApp EMI due reminder cron...');
    const now = new Date();
    const futureDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    try {
      const pendingSchedules = await this.prisma.plRepaymentSchedule.findMany({
        where: {
          paymentStatus: 'PENDING',
          dueDate: { gte: now, lte: futureDate },
          loan: {
            status: { in: ['DISBURSED', 'READY_FOR_DISBURSAL', 'DISBURSAL_PROCESSING'] },
          },
        },
        take: 100,
        orderBy: { dueDate: 'asc' },
      });

      for (const schedule of pendingSchedules) {
        try {
          await this.triggerEmiDueReminderWhatsApp(schedule.id, WhatsAppTriggerSource.CRON);
        } catch (err: any) {
          this.logger.warn(`Failed to send WhatsApp EMI reminder for schedule #${schedule.id}: ${err?.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error('Error during WhatsApp EMI reminder cron:', err?.stack);
    }
  }

  /**
   * Daily cron job at 11:30 AM IST to follow up on pending applications stuck for > 3 hours.
   */
  @Cron('0 30 11 * * *')
  async cronPendingStepFollowUp(): Promise<void> {
    if (!this.isAutoWhatsAppEnabled() || !this.isWithinMessagingHours()) return;

    this.logger.log('Starting automated WhatsApp pending application step nudge cron...');
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

    try {
      const stuckApplications = await this.prisma.plApplication.findMany({
        where: {
          status: {
            in: [
              'DRAFT',
              'SUBMITTED',
              'ALLOCATION_PENDING',
              'LENDER_ALLOCATED',
              'LENDER_REVIEW',
              'LENDER_PRE_APPROVED',
              'PENDING_CREDIT_REVIEW',
            ],
          },
          updatedAt: { lte: threeHoursAgo },
        },
        take: 50,
        orderBy: { updatedAt: 'asc' },
      });

      for (const app of stuckApplications) {
        try {
          await this.triggerPendingStepWhatsApp(app.id, WhatsAppTriggerSource.CRON);
        } catch (err: any) {
          this.logger.warn(`Failed to send WhatsApp nudge for app #${app.id}: ${err?.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error('Error during WhatsApp pending step cron:', err?.stack);
    }
  }
}
