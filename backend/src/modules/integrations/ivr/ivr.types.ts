export enum IvrCallType {
  GENERIC = 'GENERIC',
  APPLICATION_FOLLOW_UP = 'APPLICATION_FOLLOW_UP',
  KYC_PENDING = 'KYC_PENDING',
  DOCUMENT_PENDING = 'DOCUMENT_PENDING',
  MANDATE_PENDING = 'MANDATE_PENDING',
  ESIGN_PENDING = 'ESIGN_PENDING',
  LOAN_APPROVAL = 'LOAN_APPROVAL',
  DISBURSEMENT = 'DISBURSEMENT',
  DISBURSEMENT_CONFIRMATION = 'DISBURSEMENT_CONFIRMATION',
  EMI_REMINDER = 'EMI_REMINDER',
  PAYMENT_OVERDUE = 'PAYMENT_OVERDUE',
  PAYMENT_FOLLOW_UP = 'PAYMENT_FOLLOW_UP',
  PAYMENT_CONFIRMATION = 'PAYMENT_CONFIRMATION',
  REPEAT_LOAN_OFFER = 'REPEAT_LOAN_OFFER',
  CUSTOMER_SUPPORT = 'CUSTOMER_SUPPORT',
}

export enum IvrTriggerSource {
  ADMIN = 'ADMIN',
  RM = 'RM',
  SYSTEM = 'SYSTEM',
  CREDIT = 'CREDIT',
  OPERATIONS = 'OPERATIONS',
}

export interface IvrCustomerContext {
  EVENT_ID: string;
  TOUCH_POINT_CODE: string;
  CUSTOMER_ID?: string | null;
  APP_ID?: string | null;
  TRIGGERED_AT: string;
  CUSTOMER_NAME: string;
  CUSTOMER_MOBILE: string;
  TO: string;
  LAN?: string | null;
  LANGUAGE: string;
  BANK_NAME?: string | null;
  ACCOUNT_MASKED?: string | null;
  DUE_DATE?: string | null;
  APPROVED_AMOUNT?: number | null;
  MAX_TENURE_DAYS?: number | null;
  TOTAL_REPAYMENT?: number | null;
  DISBURSAL_AMOUNT?: number | null;
  DISBURSED_AMOUNT?: number | null;
  DISBURSAL_UTR?: string | null;
  TOTAL_BULLET_REPAYMENT?: number | null;
  BULLET_EMI_AMOUNT?: number | null;
  APPLICATION_LINK?: string | null;
  MANDATE_LINK?: string | null;
  E_SIGN_LINK?: string | null;
  PAYMENT_LINK?: string | null;
  LOAN_STATUS?: string | null;
  PREVIOUS_LOAN_AMOUNT?: number | null;
  REPEAT_LOAN_ELIGIBLE_AMOUNT?: number | null;
  REPEAT_LOAN_LINK?: string | null;
  [key: string]: any;
}

export interface InitiateIvrCallDto {
  to: string;
  agentId: string;
  customData?: Record<string, any>;
}

export interface PipecatNewCallResponse {
  success: boolean;
  response?: {
    message?: string;
    callId?: string;
  };
  message?: string;
  callId?: string;
  error?: string;
}

export interface PipecatCallStatusResponse {
  id?: string;
  callId?: string;
  agentId?: string;
  startTime?: string | number | null;
  endTime?: string | number | null;
  duration?: number | null;
  status?: string;
  connectionId?: string;
  userNumber?: string;
  aiNumber?: string;
  userAnalyticsSummary?: any;
  agentAnalyticsSummary?: any;
  transcript?: string;
  callSummary?: string | Record<string, any>;
  recordingLink?: string;
  conversationData?: any;
  clientId?: string;
  batchCampaignId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface TriggerCallParams {
  customerId?: bigint | number;
  applicationId?: bigint | number;
  lan?: string;
  callType?: IvrCallType;
  triggerSource?: IvrTriggerSource;
  triggeredById?: string;
  customNotes?: string;
}
