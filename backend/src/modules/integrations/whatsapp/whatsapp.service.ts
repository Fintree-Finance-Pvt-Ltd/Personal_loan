import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  SendTemplateMessageParams,
  WhatsAppMessageStatus,
  WhatsAppSendPayload,
  WhatsAppSendResult,
  WhatsAppTemplateComponent,
  WhatsAppTemplateName,
  WhatsAppTemplateParameter,
} from './whatsapp.types';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly httpClient: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const baseURL =
      this.configService.get<string>('WHATSAPP_API_BASE_URL') ||
      'https://alots.io';
    const timeout =
      this.configService.get<number>('WHATSAPP_REQUEST_TIMEOUT') || 30000;

    this.httpClient = axios.create({
      baseURL: baseURL.replace(/\/+$/, ''),
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Normalizes Indian mobile number to E.164 without leading plus (91XXXXXXXXXX).
   * Supports inputs like: 9876543210, +919876543210, 09876543210, 919876543210.
   */
  normalizeMobileNumber(mobile: string | null | undefined): string {
    if (!mobile) {
      throw new BadRequestException('Recipient mobile number is missing.');
    }

    const clean = String(mobile).trim().replace(/[^\d]/g, '');

    // 10-digit Indian mobile number
    if (/^[6-9]\d{9}$/.test(clean)) {
      return `91${clean}`;
    }

    // 12-digit starting with 91
    if (/^91[6-9]\d{9}$/.test(clean)) {
      return clean;
    }

    // 11-digit starting with 0
    if (/^0[6-9]\d{9}$/.test(clean)) {
      return `91${clean.substring(1)}`;
    }

    // Other valid international phone numbers (11 to 15 digits)
    if (clean.length >= 11 && clean.length <= 15) {
      return clean;
    }

    throw new BadRequestException(
      `Invalid mobile number format: '${mobile}'. A valid 10-digit Indian mobile number is required.`,
    );
  }

  /**
   * Helper to format currency values cleanly (e.g. 12000 -> "₹12,000" or "12,000").
   */
  formatAmount(amount: any): string {
    if (amount == null || amount === '') return '0';
    const num = Number(String(amount).replace(/[^\d.-]/g, ''));
    if (isNaN(num)) return String(amount);
    return `₹${num.toLocaleString('en-IN')}`;
  }

  /**
   * Cleans / formats customer display name.
   */
  formatCustomerName(name: string | null | undefined): string {
    if (!name) return 'Customer';
    return String(name).trim();
  }

  /**
   * Sends an approved WhatsApp template message via Alots.io WhatsApp API v23.0.
   */
  async sendTemplateMessage(
    params: SendTemplateMessageParams,
  ): Promise<WhatsAppSendResult> {
    const {
      to,
      templateName,
      languageCode = 'en',
      headerDocument,
      bodyParameters = [],
      bizOpaqueCallbackData,
      customerId,
      applicationId,
      lan,
      eventType = 'CUSTOM',
    } = params;

    let normalizedMobile: string;
    try {
      normalizedMobile = this.normalizeMobileNumber(to);
    } catch (err: any) {
      this.logger.warn(`WhatsApp validation failure: ${err?.message}`);
      return {
        success: false,
        status: WhatsAppMessageStatus.FAILED,
        recipientMobile: String(to || ''),
        templateName: String(templateName || ''),
        errorCode: 'INVALID_MOBILE_NUMBER',
        errorMessage: err?.message,
      };
    }

    const phoneNumberId =
      this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') ||
      '653172951223151';
    const apiVersion =
      this.configService.get<string>('WHATSAPP_API_VERSION') || 'v23.0';
    const accessToken =
      this.configService.get<string>('WHATSAPP_ACCESS_TOKEN') ||
      'f505b577-47cd-4c15-9c0f-ee3cbbebc824';

    const opaqueId =
      bizOpaqueCallbackData ||
      `WA_${eventType}_${lan || applicationId || 'CUST'}_${randomBytes(4).toString('hex')}`;

    // Build components
    const components: WhatsAppTemplateComponent[] = [];

    // Header component (document if present)
    if (headerDocument && (headerDocument.link || headerDocument.id)) {
      const docParam: WhatsAppTemplateParameter = {
        type: 'document',
        document: {
          ...(headerDocument.id ? { id: headerDocument.id } : {}),
          ...(headerDocument.link ? { link: headerDocument.link } : {}),
          filename: headerDocument.filename || `Document_${lan || 'Loan'}.pdf`,
        },
      };
      components.push({
        type: 'header',
        parameters: [docParam],
      });
    }

    // Body component
    if (bodyParameters && bodyParameters.length > 0) {
      const bodyParams: WhatsAppTemplateParameter[] = bodyParameters.map(
        (val) => ({
          type: 'text',
          text: String(val == null ? '' : val).trim(),
        }),
      );
      components.push({
        type: 'body',
        parameters: bodyParams,
      });
    }

    const payload: WhatsAppSendPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedMobile,
      type: 'template',
      template: {
        name: String(templateName),
        language: {
          code: languageCode,
        },
        components,
      },
      biz_opaque_callback_data: opaqueId,
    };

    const endpoint = `/${apiVersion}/${phoneNumberId}/messages`;

    this.logger.log({
      event: 'whatsapp_message_dispatching',
      to: normalizedMobile,
      template: templateName,
      eventType,
      lan: lan || undefined,
      applicationId: applicationId ? String(applicationId) : undefined,
      endpoint,
    });

    let messageId: string | undefined;
    let providerRawResponse: any = null;
    let errorCode: string | undefined;
    let errorMessage: string | undefined;
    let status: WhatsAppMessageStatus = WhatsAppMessageStatus.PENDING;

    try {
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await this.httpClient.post<any>(endpoint, payload, {
        headers,
      });

      providerRawResponse = response.data;
      messageId =
        providerRawResponse?.messages?.[0]?.id ||
        providerRawResponse?.message_id ||
        providerRawResponse?.id;

      if (messageId) {
        status = WhatsAppMessageStatus.ACCEPTED;
      } else {
        status = WhatsAppMessageStatus.FAILED;
        errorCode = 'NO_MESSAGE_ID_RETURNED';
        errorMessage =
          providerRawResponse?.message ||
          'Provider did not return a message ID.';
      }
    } catch (err: any) {
      status = WhatsAppMessageStatus.FAILED;
      const rawData = err?.response?.data;
      errorCode =
        rawData?.error?.code?.toString() ||
        rawData?.error_data?.code?.toString() ||
        (err?.response?.status ? `HTTP_${err.response.status}` : 'NETWORK_ERROR');
      errorMessage =
        rawData?.error?.message ||
        rawData?.error?.details ||
        rawData?.message ||
        (typeof rawData === 'string' ? rawData : err?.message) ||
        'Unknown WhatsApp API error.';

      this.logger.error({
        event: 'whatsapp_dispatch_failure',
        template: templateName,
        mobile: normalizedMobile,
        errorCode,
        errorMessage,
        status: err?.response?.status,
      });
    }

    // Persist to database log
    let logRecord: any = null;
    try {
      logRecord = await this.prisma.plWhatsappMessageLog.create({
        data: {
          customerId: customerId ? BigInt(customerId) : null,
          applicationId: applicationId ? BigInt(applicationId) : null,
          lan: lan || null,
          recipientMobile: normalizedMobile,
          eventType: String(eventType),
          templateName: String(templateName),
          languageCode,
          providerMessageId: messageId || null,
          bizOpaqueCallbackData: opaqueId,
          status,
          errorCode: errorCode || null,
          errorMessage: errorMessage || null,
          templateParameters: bodyParameters,
          providerResponse: providerRawResponse || undefined,
          sentAt: status === WhatsAppMessageStatus.ACCEPTED ? new Date() : null,
          failedAt: status === WhatsAppMessageStatus.FAILED ? new Date() : null,
        },
      });
    } catch (dbErr: any) {
      this.logger.warn({
        event: 'whatsapp_db_log_error',
        error: dbErr?.message,
      });
    }

    return {
      success: status === WhatsAppMessageStatus.ACCEPTED,
      messageId,
      status,
      recipientMobile: normalizedMobile,
      templateName: String(templateName),
      logId: logRecord?.id ? logRecord.id.toString() : undefined,
      errorCode,
      errorMessage,
      rawResponse: providerRawResponse,
    };
  }

  /**
   * Updates message status based on incoming provider webhook callback (sent, delivered, read, failed).
   */
  async updateMessageStatus(params: {
    providerMessageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp?: string | number;
    errorCode?: string;
    errorMessage?: string;
    rawPayload?: any;
  }): Promise<boolean> {
    const { providerMessageId, status, timestamp, errorCode, errorMessage } =
      params;
    if (!providerMessageId) return false;

    const eventDate = timestamp
      ? new Date(
          typeof timestamp === 'number'
            ? timestamp * 1000
            : Number(timestamp) * 1000 || Date.now(),
        )
      : new Date();

    const updateData: Record<string, any> = {
      status: status.toUpperCase(),
    };

    if (status === 'sent') {
      updateData.sentAt = eventDate;
    } else if (status === 'delivered') {
      updateData.deliveredAt = eventDate;
    } else if (status === 'read') {
      updateData.readAt = eventDate;
    } else if (status === 'failed') {
      updateData.failedAt = eventDate;
      if (errorCode) updateData.errorCode = String(errorCode);
      if (errorMessage) updateData.errorMessage = String(errorMessage);
    }

    try {
      const res = await this.prisma.plWhatsappMessageLog.updateMany({
        where: { providerMessageId },
        data: updateData,
      });

      this.logger.log({
        event: 'whatsapp_status_updated',
        providerMessageId,
        status: status.toUpperCase(),
        recordsUpdated: res.count,
      });

      return res.count > 0;
    } catch (err: any) {
      this.logger.warn({
        event: 'whatsapp_status_update_error',
        providerMessageId,
        error: err?.message,
      });
      return false;
    }
  }

  /**
   * Queries message logs for admin inspection.
   */
  async getMessageLogs(params: {
    applicationId?: bigint | number | string;
    lan?: string;
    customerId?: bigint | number | string;
    limit?: number;
  }) {
    const { applicationId, lan, customerId, limit = 50 } = params;

    const orConditions: any[] = [];
    if (applicationId) orConditions.push({ applicationId: BigInt(applicationId) });
    if (lan) orConditions.push({ lan: String(lan) });
    if (customerId) orConditions.push({ customerId: BigInt(customerId) });

    const where =
      orConditions.length > 1
        ? { OR: orConditions }
        : orConditions.length === 1
        ? orConditions[0]
        : {};

    return this.prisma.plWhatsappMessageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 100),
    });
  }
}
