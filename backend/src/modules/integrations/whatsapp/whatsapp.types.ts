export enum WhatsAppEventType {
  LOAN_APPROVED = 'LOAN_APPROVED',
  LOAN_DISBURSED = 'LOAN_DISBURSED',
  EMI_DUE = 'EMI_DUE',
  APPLICATION_PENDING = 'APPLICATION_PENDING',
  FULLY_PAID = 'FULLY_PAID',
  CUSTOM = 'CUSTOM',
}

export enum WhatsAppTemplateName {
  LOAN_APPROVED = 'loan_approved',
  LOAN_DISBURSED = 'loan_disbursed',
  EMI_DUE_REMINDER = 'emi_due_reminder',
  APPLICATION_PENDING = 'application_pending',
  FULLY_PAID = 'fully_paid',
}

export enum WhatsAppMessageStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

export enum WhatsAppTriggerSource {
  SYSTEM_AUTOMATION = 'SYSTEM_AUTOMATION',
  ADMIN = 'ADMIN',
  CRON = 'CRON',
  MANUAL_TEST = 'MANUAL_TEST',
}

export interface WhatsAppDocumentHeader {
  id?: string;
  link?: string;
  filename?: string;
}

export interface WhatsAppTemplateParameter {
  type: 'text' | 'document' | 'image' | 'video' | 'payload';
  text?: string;
  document?: WhatsAppDocumentHeader;
  [key: string]: any;
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: string;
  index?: string | number;
  parameters: WhatsAppTemplateParameter[];
}

export interface WhatsAppSendPayload {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components: WhatsAppTemplateComponent[];
  };
  biz_opaque_callback_data?: string;
}

export interface SendTemplateMessageParams {
  to: string;
  templateName: WhatsAppTemplateName | string;
  languageCode?: string;
  headerDocument?: WhatsAppDocumentHeader;
  bodyParameters?: Array<string | number>;
  bizOpaqueCallbackData?: string;
  customerId?: bigint | number | string;
  applicationId?: bigint | number | string;
  lan?: string;
  eventType?: WhatsAppEventType | string;
  triggerSource?: WhatsAppTriggerSource;
  triggeredById?: string;
}

export interface TriggerWhatsAppEventParams {
  eventType: WhatsAppEventType;
  customerId?: bigint | number | string;
  applicationId?: bigint | number | string;
  lan?: string;
  installmentId?: bigint | number | string;
  documentUrl?: string;
  documentFilename?: string;
  triggerSource?: WhatsAppTriggerSource;
  triggeredById?: string;
  overrideMobile?: string;
  customData?: Record<string, any>;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  status: WhatsAppMessageStatus;
  recipientMobile: string;
  templateName: string;
  logId?: string;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: any;
}

export interface WhatsAppWebhookStatusItem {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin?: {
      type: string;
    };
    expiration_timestamp?: string;
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: {
      details: string;
    };
  }>;
  biz_opaque_callback_data?: string;
}

export interface WhatsAppWebhookMessageItem {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: {
    body: string;
  };
  button?: {
    text: string;
    payload: string;
  };
  interactive?: {
    type: string;
    button_reply?: {
      id: string;
      title: string;
    };
  };
}

export interface WhatsAppWebhookChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  statuses?: WhatsAppWebhookStatusItem[];
  messages?: WhatsAppWebhookMessageItem[];
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes: Array<{
      value: WhatsAppWebhookChangeValue;
      field: string;
    }>;
  }>;
}
