export enum SmsTemplateType {
  LOAN_APPROVED = 'LOAN_APPROVED',
  LOAN_DISBURSED = 'LOAN_DISBURSED',
  REPAYMENT_REMINDER = 'REPAYMENT_REMINDER',
  PENDING_STEP = 'PENDING_STEP',
  LOAN_FULLY_PAID = 'LOAN_FULLY_PAID',
}

export interface SmsSendResult {
  success: boolean;
  skipped?: boolean;
  simulated?: boolean;
  reason?: string;
  templateType?: SmsTemplateType | string;
  templateId?: string;
  mobile?: string;
  message?: string;
  providerResponse?: any;
}

export interface LoanApprovedSmsPayload {
  mobile: string;
  customerName: string;
  approvedAmount: number | string;
  journeyLink?: string;
  lan: string;
  applicationId?: bigint | string;
}

export interface LoanDisbursedSmsPayload {
  mobile: string;
  customerName: string;
  disbursedAmount: number | string;
  lan: string;
}

export interface RepaymentReminderSmsPayload {
  mobile: string;
  customerName: string;
  amountDue: number | string;
  lan: string;
  dueDate: string; // e.g. 24/08/2026 or DD/MM/YYYY
}

export interface PendingStepSmsPayload {
  mobile: string;
  customerName: string;
  pendingStep: string;
  resumeLink?: string;
  applicationRef: string;
}

export interface LoanFullyPaidSmsPayload {
  mobile: string;
  customerName: string;
  previousLan: string;
  eligibleAmount: number | string;
  applyLink?: string;
  customerId?: bigint | string;
}

export interface SmsTemplateDetails {
  type: SmsTemplateType;
  name: string;
  templateId: string | null;
  dltSampleContent: string;
  variables: string[];
  isConfigured: boolean;
}

