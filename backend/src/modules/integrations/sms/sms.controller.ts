import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { SmsAutomationService } from './sms-automation.service';
import { SmsService } from './sms.service';
import { SmsTemplateType } from './sms.types';

@Controller('sms')
export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly smsAutomationService: SmsAutomationService,
  ) {}

  /**
   * Returns metadata and status for all 4 SMS templates.
   */
  @Get('templates')
  getTemplates() {
    return {
      success: true,
      data: this.smsService.getTemplatesStatus(),
    };
  }

  /**
   * Test sending an SMS for any of the 4 templates.
   */
  @Post('test')
  async sendTestSms(
    @Body()
    body: {
      templateType: SmsTemplateType;
      mobile: string;
      customerName?: string;
      amount?: number | string;
      lan?: string;
      dueDate?: string;
      pendingStep?: string;
      journeyLink?: string;
    },
  ) {
    const {
      templateType,
      mobile,
      customerName = 'Valued Customer',
      amount = 5000,
      lan = 'FTPL00000001',
      dueDate = '25/08/2026',
      pendingStep = 'Bank Verification',
      journeyLink,
    } = body;

    if (!templateType || !mobile) {
      throw new BadRequestException('templateType and mobile are required.');
    }

    switch (templateType) {
      case SmsTemplateType.LOAN_APPROVED:
        return this.smsService.sendLoanApprovedSms({
          mobile,
          customerName,
          approvedAmount: amount,
          lan,
          journeyLink,
        });

      case SmsTemplateType.LOAN_DISBURSED:
        return this.smsService.sendLoanDisbursedSms({
          mobile,
          customerName,
          disbursedAmount: amount,
          lan,
        });

      case SmsTemplateType.REPAYMENT_REMINDER:
        return this.smsService.sendRepaymentReminderSms({
          mobile,
          customerName,
          amountDue: amount,
          lan,
          dueDate,
        });

      case SmsTemplateType.PENDING_STEP:
        return this.smsService.sendPendingStepSms({
          mobile,
          customerName,
          pendingStep,
          applicationRef: lan,
          resumeLink: journeyLink,
        });

      case SmsTemplateType.LOAN_FULLY_PAID:
        return this.smsService.sendLoanFullyPaidSms({
          mobile,
          customerName,
          previousLan: lan,
          eligibleAmount: amount,
          applyLink: journeyLink,
        });

      default:
        throw new BadRequestException(`Unknown templateType: ${templateType}`);
    }
  }

  /**
   * Manually triggers due reminder cron job (admin test / on-demand trigger).
   */
  @Post('cron/trigger-due-reminders')
  async triggerDueReminders() {
    await this.smsAutomationService.cronDueReminders();
    return { success: true, message: 'Due reminders job executed.' };
  }

  /**
   * Manually triggers pending step cron job (admin test / on-demand trigger).
   */
  @Post('cron/trigger-pending-reminders')
  async triggerPendingReminders() {
    await this.smsAutomationService.cronPendingStepFollowUp();
    return { success: true, message: 'Pending step follow-up job executed.' };
  }
}
