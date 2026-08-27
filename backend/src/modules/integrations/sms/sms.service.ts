import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  LoanApprovedSmsPayload,
  LoanDisbursedSmsPayload,
  LoanFullyPaidSmsPayload,
  PendingStepSmsPayload,
  RepaymentReminderSmsPayload,
  SmsSendResult,
  SmsTemplateDetails,
  SmsTemplateType,
} from './sms.types';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Normalizes Indian mobile number to 10 digits for the SMS gateway.
   */
  normalizeMobileNumber(mobile: string | null | undefined): string {
    if (!mobile) {
      throw new Error('Mobile number is required for sending SMS.');
    }
    const clean = String(mobile).trim().replace(/[^\d]/g, '');
    if (clean.length === 10) return clean;
    if (clean.length === 12 && clean.startsWith('91')) return clean.substring(2);
    if (clean.length === 11 && clean.startsWith('0')) return clean.substring(1);
    if (clean.length > 10) return clean.slice(-10);
    return clean;
  }

  /**
   * Cleans / formats customer display name.
   */
  private formatCustomerName(name: string | null | undefined): string {
    if (!name) return 'Customer';
    const trimmed = String(name).trim();
    return trimmed.split(' ')[0] || 'Customer';
  }

  /**
   * Base low-level sender to ALOT SMS gateway.
   */
  async sendGatewaySms(params: {
    mobile: string;
    text: string;
    dltTemplateId: string;
    templateType?: SmsTemplateType | string;
  }): Promise<SmsSendResult> {
    const { mobile, text, dltTemplateId, templateType } = params;

    const apiUrl =
      this.configService.get<string>('ALOT_API_URL') ||
      process.env.ALOT_API_URL?.trim() ||
      'https://alotsolutions.in/api/mt/SendSMS';

    const user =
      this.configService.get<string>('ALOT_USER') ||
      process.env.ALOT_USER?.trim();

    const password =
      this.configService.get<string>('ALOT_PASSWORD') ||
      process.env.ALOT_PASSWORD?.trim();

    const senderId =
      this.configService.get<string>('SENDER_ID') ||
      process.env.SENDER_ID?.trim() ||
      'FTREEN';

    const peId =
      this.configService.get<string>('DLT_PEID') ||
      process.env.DLT_PEID?.trim() ||
      '1201159568446234948';

    const channel = process.env.ALOT_CHANNEL?.trim() || 'TRANS';
    const route = process.env.ALOT_ROUTE?.trim() || '5';

    const allowDevSimulate =
      process.env.NODE_ENV !== 'production' &&
      String(process.env.SIMULATE_SMS || '').toLowerCase() === 'true';

    const missingConfigs = [
      !apiUrl && 'ALOT_API_URL',
      !user && 'ALOT_USER',
      !password && 'ALOT_PASSWORD',
      !senderId && 'SENDER_ID',
      !dltTemplateId && 'DLTTemplateId',
      !peId && 'DLT_PEID',
    ].filter(Boolean);

    if (missingConfigs.length > 0) {
      this.logger.warn(
        `[SMS] Skipping SMS send (${templateType || 'CUSTOM'}). Missing config: ${missingConfigs.join(', ')}`,
      );
      return {
        success: false,
        skipped: true,
        reason: `Missing configuration: ${missingConfigs.join(', ')}`,
        templateType,
        templateId: dltTemplateId,
        mobile: mobile.slice(-4),
        message: text,
      };
    }

    if (allowDevSimulate) {
      this.logger.log(
        `[SMS DEV SIMULATION] To: ending in ${mobile.slice(-4)} | DLT: ${dltTemplateId} | Text: "${text}"`,
      );
      return {
        success: true,
        simulated: true,
        templateType,
        templateId: dltTemplateId,
        mobile: mobile.slice(-4),
        message: text,
      };
    }

    const queryParams = {
      user,
      password,
      senderid: senderId,
      channel,
      DCS: '0',
      flashsms: '0',
      number: mobile,
      text,
      route,
      DLTTemplateId: dltTemplateId,
      PEID: peId,
    };

    try {
      this.logger.log(
        `[SMS Gateway] Sending [${templateType || 'SMS'}] to mobile ending ${mobile.slice(-4)} (DLT ID: ${dltTemplateId})...`,
      );

      const response = await axios.get(apiUrl, {
        params: queryParams,
        timeout: 15_000,
      });

      this.logger.log(
        `[SMS Gateway] Sent successfully to ending ${mobile.slice(-4)}. Provider response: ${JSON.stringify(
          response.data,
        )}`,
      );

      return {
        success: true,
        skipped: false,
        templateType,
        templateId: dltTemplateId,
        mobile: mobile.slice(-4),
        message: text,
        providerResponse: response.data,
      };
    } catch (error: any) {
      const providerMessage = axios.isAxiosError(error)
        ? error.response?.data || error.message
        : error instanceof Error
          ? error.message
          : String(error);

      this.logger.error(
        `[SMS Gateway] Provider failed to send [${templateType}] to ${mobile.slice(-4)}: ${JSON.stringify(
          providerMessage,
        )}`,
      );

      return {
        success: false,
        skipped: false,
        reason: 'SMS Provider Gateway Error',
        templateType,
        templateId: dltTemplateId,
        mobile: mobile.slice(-4),
        message: text,
        providerResponse: providerMessage,
      };
    }
  }

  // ==========================================
  // 1. TEMPLATE 1: Loan Approved (Post-Approval Journey)
  // DLT ID: 1777178773875446122
  // DLT Sample: "Dear {{1}}, your Personal Loan of Rs. {{2}} has been approved. Please complete the remaining steps to proceed with disbursal: {{3}}. LAN: {{4}}. - Fintree Finance Pvt. Ltd."
  // Variables: {{1}}=Name, {{2}}=Amount, {{3}}=Journey Link, {{4}}=LAN
  // ==========================================
  async sendLoanApprovedSms(input: LoanApprovedSmsPayload): Promise<SmsSendResult> {
    const templateId = (
      this.configService.get<string>('SMS_TEMPLATE_LOAN_APPROVED_ID') ||
      process.env.SMS_TEMPLATE_LOAN_APPROVED_ID ||
      '1777178773875446122'
    ).trim();

    const normalizedMobile = this.normalizeMobileNumber(input.mobile);
    const customerName = this.formatCustomerName(input.customerName);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'https://finle-prod.fintreelms.com';

    const journeyLink =
      input.journeyLink ||
      (input.applicationId
        ? `${frontendUrl}/apply/${input.applicationId}`
        : `${frontendUrl}/customer/application`);

    const text = `Dear ${customerName}, your Personal Loan of Rs. ${input.approvedAmount} has been approved. Please complete the remaining steps to proceed with disbursal: ${journeyLink}. LAN: ${input.lan}. - Fintree Finance Pvt. Ltd.`;

    return this.sendGatewaySms({
      mobile: normalizedMobile,
      text,
      dltTemplateId: templateId,
      templateType: SmsTemplateType.LOAN_APPROVED,
    });
  }

  // ==========================================
  // 2. TEMPLATE 2: Loan Disbursed (Disbursal Confirmation)
  // DLT ID: 1777178755693472309
  // DLT Sample: "Dear {{1}}, your Personal Loan of Rs. {{2}} has been successfully disbursed to your registered bank account. LAN: {{3}}. Thank you for choosing Fintree Finance Pvt. Ltd."
  // Variables: {{1}}=Name, {{2}}=Disbursed Amount, {{3}}=LAN
  // ==========================================
  async sendLoanDisbursedSms(input: LoanDisbursedSmsPayload): Promise<SmsSendResult> {
    const templateId = (
      this.configService.get<string>('SMS_TEMPLATE_LOAN_DISBURSED_ID') ||
      process.env.SMS_TEMPLATE_LOAN_DISBURSED_ID ||
      '1777178755693472309'
    ).trim();

    const normalizedMobile = this.normalizeMobileNumber(input.mobile);
    const customerName = this.formatCustomerName(input.customerName);

    const text = `Dear ${customerName}, your Personal Loan of Rs. ${input.disbursedAmount} has been successfully disbursed to your registered bank account. LAN: ${input.lan}. Thank you for choosing Fintree Finance Pvt. Ltd.`;

    return this.sendGatewaySms({
      mobile: normalizedMobile,
      text,
      dltTemplateId: templateId,
      templateType: SmsTemplateType.LOAN_DISBURSED,
    });
  }

  // ==========================================
  // 3. TEMPLATE 3: Repayment / EMI Due Reminder
  // DLT ID: 1777178755725728690
  // DLT Sample: "Dear {{1}}, reminder that Rs. {{2}} for your Personal Loan LAN {{3}} is due on {{4}}. Please ensure sufficient balance in your registered bank account for timely repayment. - Fintree Finance Pvt. Ltd."
  // Variables: {{1}}=Name, {{2}}=Amount Due, {{3}}=LAN, {{4}}=Due Date
  // ==========================================
  async sendRepaymentReminderSms(input: RepaymentReminderSmsPayload): Promise<SmsSendResult> {
    const templateId = (
      this.configService.get<string>('SMS_TEMPLATE_REPAYMENT_REMINDER_ID') ||
      process.env.SMS_TEMPLATE_REPAYMENT_REMINDER_ID ||
      '1777178755725728690'
    ).trim();

    const normalizedMobile = this.normalizeMobileNumber(input.mobile);
    const customerName = this.formatCustomerName(input.customerName);

    const text = `Dear ${customerName}, reminder that Rs. ${input.amountDue} for your Personal Loan LAN ${input.lan} is due on ${input.dueDate}. Please ensure sufficient balance in your registered bank account for timely repayment. - Fintree Finance Pvt. Ltd.`;

    return this.sendGatewaySms({
      mobile: normalizedMobile,
      text,
      dltTemplateId: templateId,
      templateType: SmsTemplateType.REPAYMENT_REMINDER,
    });
  }

  // ==========================================
  // 4. TEMPLATE 4: Pending Application Step (Drop-off Recovery)
  // DLT ID: 1777178773892460194
  // DLT Sample: "Dear {{1}}, your Personal Loan application is pending at the {{2}} step. Please complete this step to continue your application: {{3}}. Application Ref: {{4}}. - Fintree Finance Pvt Ltd."
  // Variables: {{1}}=Name, {{2}}=Pending Step, {{3}}=Resume Link, {{4}}=Application Number/Ref
  // ==========================================
  async sendPendingStepSms(input: PendingStepSmsPayload): Promise<SmsSendResult> {
    const templateId = (
      this.configService.get<string>('SMS_TEMPLATE_PENDING_STEP_ID') ||
      process.env.SMS_TEMPLATE_PENDING_STEP_ID ||
      '1777178773892460194'
    ).trim();

    const normalizedMobile = this.normalizeMobileNumber(input.mobile);
    const customerName = this.formatCustomerName(input.customerName);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'https://finle-prod.fintreelms.com';

    const resumeLink =
      input.resumeLink ||
      `${frontendUrl}/customer/login`;

    const text = `Dear ${customerName}, your Personal Loan application is pending at the ${input.pendingStep} step. Please complete this step to continue your application: ${resumeLink}. Application Ref: ${input.applicationRef}. - Fintree Finance Pvt Ltd.`;

    return this.sendGatewaySms({
      mobile: normalizedMobile,
      text,
      dltTemplateId: templateId,
      templateType: SmsTemplateType.PENDING_STEP,
    });
  }

  // ==========================================
  // 5. TEMPLATE 5: Loan Fully Paid / Repeat Loan Offer
  // DLT ID: 1777178774771045828
  // DLT Sample: "Dear {{1}}, congratulations! You have successfully completed repayment of your Personal Loan LAN {{2}}. Based on your repayment history, you are eligible to apply for a new Personal Loan of up to Rs. {{3}}. Apply now: {{4}}. - Fintree Finance Pvt Ltd"
  // Variables: {{1}}=Name, {{2}}=Previous Loan LAN, {{3}}=Repeat Loan Eligible Amount, {{4}}=New Loan Application Link
  // ==========================================
  async sendLoanFullyPaidSms(input: LoanFullyPaidSmsPayload): Promise<SmsSendResult> {
    const templateId = (
      this.configService.get<string>('SMS_TEMPLATE_LOAN_FULLY_PAID_ID') ||
      process.env.SMS_TEMPLATE_LOAN_FULLY_PAID_ID ||
      '1777178774771045828'
    ).trim();

    const normalizedMobile = this.normalizeMobileNumber(input.mobile);
    const customerName = this.formatCustomerName(input.customerName);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'https://finle-prod.fintreelms.com';

    const applyLink =
      input.applyLink ||
      `${frontendUrl}/customer/login`;

    const text = `Dear ${customerName}, congratulations! You have successfully completed repayment of your Personal Loan LAN ${input.previousLan}. Based on your repayment history, you are eligible to apply for a new Personal Loan of up to Rs. ${input.eligibleAmount}. Apply now: ${applyLink}. - Fintree Finance Pvt Ltd`;

    return this.sendGatewaySms({
      mobile: normalizedMobile,
      text,
      dltTemplateId: templateId,
      templateType: SmsTemplateType.LOAN_FULLY_PAID,
    });
  }

  /**
   * Helper to retrieve all configured templates and status.
   */
  getTemplatesStatus(): SmsTemplateDetails[] {
    const t1 = (this.configService.get<string>('SMS_TEMPLATE_LOAN_APPROVED_ID') || process.env.SMS_TEMPLATE_LOAN_APPROVED_ID || '1777178773875446122').trim();
    const t2 = (this.configService.get<string>('SMS_TEMPLATE_LOAN_DISBURSED_ID') || process.env.SMS_TEMPLATE_LOAN_DISBURSED_ID || '1777178755693472309').trim();
    const t3 = (this.configService.get<string>('SMS_TEMPLATE_REPAYMENT_REMINDER_ID') || process.env.SMS_TEMPLATE_REPAYMENT_REMINDER_ID || '1777178755725728690').trim();
    const t4 = (this.configService.get<string>('SMS_TEMPLATE_PENDING_STEP_ID') || process.env.SMS_TEMPLATE_PENDING_STEP_ID || '1777178773892460194').trim();
    const t5 = (this.configService.get<string>('SMS_TEMPLATE_LOAN_FULLY_PAID_ID') || process.env.SMS_TEMPLATE_LOAN_FULLY_PAID_ID || '1777178774771045828').trim();

    return [
      {
        type: SmsTemplateType.LOAN_APPROVED,
        name: 'Loan Approved (Post-approval journey)',
        templateId: t1,
        dltSampleContent:
          'Dear {{1}}, your Personal Loan of Rs. {{2}} has been approved. Please complete the remaining steps to proceed with disbursal: {{3}}. LAN: {{4}}. - Fintree Finance Pvt. Ltd.',
        variables: ['Customer Name', 'Approved Loan Amount', 'Post-approval journey link', 'LAN'],
        isConfigured: true,
      },
      {
        type: SmsTemplateType.LOAN_DISBURSED,
        name: 'Loan Disbursed Confirmation',
        templateId: t2,
        dltSampleContent:
          'Dear {{1}}, your Personal Loan of Rs. {{2}} has been successfully disbursed to your registered bank account. LAN: {{3}}. Thank you for choosing Fintree Finance Pvt. Ltd.',
        variables: ['Customer Name', 'Net Disbursal Amount', 'LAN'],
        isConfigured: true,
      },
      {
        type: SmsTemplateType.REPAYMENT_REMINDER,
        name: 'Repayment / EMI Due Reminder',
        templateId: t3,
        dltSampleContent:
          'Dear {{1}}, reminder that Rs. {{2}} for your Personal Loan LAN {{3}} is due on {{4}}. Please ensure sufficient balance in your registered bank account for timely repayment. - Fintree Finance Pvt. Ltd.',
        variables: ['Customer Name', 'Amount Due', 'LAN', 'Due Date'],
        isConfigured: true,
      },
      {
        type: SmsTemplateType.PENDING_STEP,
        name: 'Pending Step Follow-up',
        templateId: t4,
        dltSampleContent:
          'Dear {{1}}, your Personal Loan application is pending at the {{2}} step. Please complete this step to continue your application: {{3}}. Application Ref: {{4}}. - Fintree Finance Pvt Ltd.',
        variables: ['Customer Name', 'Pending Step', 'Resume Application Link', 'Application Number / LAN'],
        isConfigured: true,
      },
      {
        type: SmsTemplateType.LOAN_FULLY_PAID,
        name: 'Loan Fully Paid / Repeat Loan Offer',
        templateId: t5,
        dltSampleContent:
          'Dear {{1}}, congratulations! You have successfully completed repayment of your Personal Loan LAN {{2}}. Based on your repayment history, you are eligible to apply for a new Personal Loan of up to Rs. {{3}}. Apply now: {{4}}. - Fintree Finance Pvt Ltd',
        variables: [
          'Customer Name',
          'Previous Loan LAN',
          'Repeat Loan Eligible Amount',
          'New Loan Application Link',
        ],
        isConfigured: true,
      },
    ];
  }
}
