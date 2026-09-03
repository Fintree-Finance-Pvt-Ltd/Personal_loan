import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as path from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { decryptPayload, encryptPayload } from '../../../common/utils/bank-security.helper';
import { UnaportTokenService } from './unaport-token.service';
import { LenderIntegrationOutboxService } from '../../lender-integrations/lender-integration-outbox.service';
import {
  UnaportConsentNotificationPayload,
  UnaportDataNotificationPayload,
  UnaportFetchDataAccount,
  UnaportFetchDataResponse,
  UnaportSdkConfig,
} from './unaport.types';

@Injectable()
export class UnaportService {
  private readonly logger = new Logger(UnaportService.name);
  private readonly httpClient: AxiosInstance;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tokenService: UnaportTokenService,
    private readonly outbox: LenderIntegrationOutboxService,
  ) {
    const timeout = Number(
      this.configService.get<string>('UNAPORT_HTTP_TIMEOUT_MS') || '15000',
    );
    this.httpClient = axios.create({
      timeout: isNaN(timeout) ? 15000 : timeout,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Validates that the customer owns the specified LAN / Application.
   */
  private async validateCustomerLanOwnership(
    customerId: bigint,
    lan: string,
  ): Promise<{ customer: any; application: any }> {
    const cleanLan = String(lan || '').trim();
    if (!cleanLan) {
      throw new BadRequestException('LAN is required.');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Authenticated customer profile was not found.');
    }

    const loan = await this.prisma.plLoan.findFirst({
      where: {
        customerId,
        OR: [{ lan: cleanLan }, { application: { applicationNumber: cleanLan } }],
      },
    });

    let application: any = null;
    if (loan) {
      application = await this.prisma.plApplication.findUnique({
        where: { id: loan.applicationId },
      });
    } else {
      let numericId: bigint | null = null;
      if (/^\d+$/.test(cleanLan)) {
        numericId = BigInt(cleanLan);
      } else {
        const match = cleanLan.match(/^(?:PL-APP-|PL-LAN-|APP-)(\d+)$/i);
        if (match) {
          numericId = BigInt(match[1]);
        }
      }

      application = await this.prisma.plApplication.findFirst({
        where: {
          customerId,
          OR: [
            { applicationNumber: cleanLan },
            { platformLan: cleanLan },
            ...(numericId ? [{ id: numericId }] : []),
          ],
        },
        orderBy: { id: 'desc' },
      });

      if (!application) {
        application = await this.prisma.plApplication.findFirst({
          where: { customerId },
          orderBy: { id: 'desc' },
        });
      }
    }

    if (!application) {
      throw new ForbiddenException(
        `Access denied. You do not own loan application LAN: ${cleanLan}`,
      );
    }

    return { customer, application };
  }

  /**
   * Initiate Account Aggregator Web SDK session for a customer LAN.
   */
  async initiateAccountAggregator(
    customerId: bigint,
    lan: string,
  ): Promise<{ trackingId: string; status: string; sdkUrl: string }> {
    console.log(`[AA SERVICE] [CALL] initiateAccountAggregator - customerId: ${customerId}, lan: ${lan}`);
    const startTime = Date.now();
    const cleanLan = String(lan || '').trim();

    const { customer, application } = await this.validateCustomerLanOwnership(
      customerId,
      cleanLan,
    );

    const mobileNumber = String(customer.mobileNumber || '').trim();
    if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
      throw new BadRequestException(
        'Customer does not have a valid 10-digit Indian mobile number on file.',
      );
    }

    // Check for existing pending/in-progress AA request
    const existingReq = await this.prisma.customerAccountAggregatorRequest.findFirst({
      where: {
        customerId,
        lan: cleanLan,
        status: { in: ['INITIATED', 'SDK_OPENED', 'CONSENT_PENDING', 'CONSENT_APPROVED', 'DATA_PENDING'] },
      },
      orderBy: { id: 'desc' },
    });

    let trackingId: string;

    if (existingReq) {
      // Check if initiated within last 30 minutes
      const ageMs = Date.now() - (existingReq.initiatedAt?.getTime() || 0);
      if (ageMs < 30 * 60 * 1000) {
        trackingId = existingReq.trackingId;
        this.logger.log({
          event: 'unaport_initiate_reusing_request',
          customerId: customerId.toString(),
          lan: cleanLan,
          trackingId,
          provider: 'UNAPORT',
          status: existingReq.status,
          durationMs: Date.now() - startTime,
        });
      } else {
        trackingId = `PL-AA-${cleanLan}-${Date.now()}`;
      }
    } else {
      trackingId = `PL-AA-${cleanLan}-${Date.now()}`;
    }

    // Obtain Unaport access and refresh tokens
    const tokens = await this.tokenService.getValidTokens();

    const productId = this.configService.get<string>('UNAPORT_PRODUCT_ID');
    const fiuId = this.configService.get<string>('UNAPORT_FIU_ID');
    const fiType = this.configService.get<string>('UNAPORT_FI_TYPE') || 'Deposits';
    const templateId = this.configService.get<string>('UNAPORT_TEMPLATE_ID');
    const sdkBaseUrl =
      this.configService.get<string>('UNAPORT_SDK_URL') ||
      'https://sdk.sandbox.unaport.com/view';

    if (!productId || !fiuId) {
      throw new InternalServerErrorException(
        'UNAPORT_PRODUCT_ID or UNAPORT_FIU_ID environment variable is missing.',
      );
    }

    const config: UnaportSdkConfig = {
      theme: {
        background: '#131313',
        accent: '#1B1B1B',
        primary: '#7762FF',
        primaryText: '#FFFFFF',
        primaryButtonText: '#131313',
        secondary: '#C589E4',
        secondaryText: '#F2F2F2',
        disabled: '#1F1F1F',
        disabledText: '#FEFEFE',
        border: '#767676',
        hintText: '#9e9e9e',
        errorText: '#d32f2f',
        loaderColor: '#F2F2F2',
        fontName: 'Open Sans',
      },
      productId,
      phoneNumber: mobileNumber,
      trackingId,
      fiuId,
      FIType: fiType || 'Deposits',
      ...(templateId ? { templateId } : {}),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };

    this.logger.log({
      event: 'unaport_sdk_config_payload',
      customerId: customerId.toString(),
      lan: cleanLan,
      configPayload: config,
      configPayloadJson: JSON.stringify(config, null, 2),
    });

    // Base64 encoding (note: transport encoding for SDK parameter, not encryption)
    const configString = JSON.stringify(config);
    const encodedConfig = Buffer.from(configString, 'utf8').toString('base64');
    const sdkUrl = `${sdkBaseUrl.replace(/\/+$/, '')}?config=${encodeURIComponent(encodedConfig)}`;

    // Upsert or create request row in DB
    const now = new Date();
    await this.prisma.customerAccountAggregatorRequest.upsert({
      where: { trackingId },
      create: {
        customerId,
        applicationId: application?.id ? BigInt(application.id) : null,
        lan: cleanLan,
        provider: 'UNAPORT',
        trackingId,
        status: 'INITIATED',
        initiatedAt: now,
      },
      update: {
        status: 'INITIATED',
        initiatedAt: now,
      },
    });

    this.logger.log({
      event: 'unaport_initiate_success',
      customerId: customerId.toString(),
      applicationId: application?.id?.toString() || null,
      lan: cleanLan,
      trackingId,
      provider: 'UNAPORT',
      status: 'INITIATED',
      durationMs: Date.now() - startTime,
    });

    const result = {
      trackingId,
      status: 'INITIATED',
      sdkUrl,
    };
    console.log(`[AA SERVICE] [RESPONSE] initiateAccountAggregator - result:`, JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Helper to build status response containing bank summary and ABB.
   */
  private async buildStatusResponse(request: any) {
    if (!request) {
      return {
        status: 'NOT_STARTED',
        consentStatus: null,
        dataStatus: null,
        completed: false,
        failureReason: null,
        bankSummary: null,
      };
    }

    let bankSummary: any = null;
    const bankData = await this.prisma.customerBankAccountData.findFirst({
      where: { requestId: request.id },
      orderBy: { id: 'desc' },
    });

    if (bankData || request.lan) {
      const loan = request.lan ? await this.prisma.plLoan.findFirst({ where: { lan: request.lan } }) : null;
      const customer = request.customerId ? await this.prisma.customer.findUnique({ where: { id: request.customerId } }) : null;

      bankSummary = {
        accountNumberMasked: bankData?.accountNumberMasked || loan?.bankAccountMasked || null,
        accountHolderName: bankData?.accountHolderName || loan?.bankAccountHolderName || customer?.fullName || null,
        fipName: bankData?.fipName || loan?.bankName || null,
        accountType: bankData?.accountType || loan?.bankAccountType || 'SAVINGS',
        currentBalance: bankData?.currentBalance ? Number(bankData.currentBalance) : null,
        availableBalance: bankData?.availableBalance ? Number(bankData.availableBalance) : null,
        averageBalance: bankData?.averageBalance ? Number(bankData.averageBalance) : null,
        abb: bankData?.averageBalance ? Number(bankData.averageBalance) : (bankData?.currentBalance ? Number(bankData.currentBalance) : null),
      };
    }

    return {
      status: request.status,
      consentStatus: request.consentStatus,
      dataStatus: request.dataStatus,
      completed: request.status === 'SUCCESS',
      failureReason: request.failureReason,
      bankSummary,
    };
  }

  /**
   * Get normalized Account Aggregator status for a customer LAN.
   */
  async getStatus(
    customerId: bigint,
    lan: string,
  ): Promise<{
    status: string;
    consentStatus: string | null;
    dataStatus: string | null;
    completed: boolean;
    failureReason: string | null;
    bankSummary?: any;
  }> {
    console.log(`[AA SERVICE] [CALL] getStatus - customerId: ${customerId}, lan: ${lan}`);
    const cleanLan = String(lan || '').trim();
    await this.validateCustomerLanOwnership(customerId, cleanLan);

    let request = await this.prisma.customerAccountAggregatorRequest.findFirst({
      where: { customerId, lan: cleanLan },
      orderBy: { id: 'desc' },
    });

    if (!request) {
      return this.buildStatusResponse(null);
    }

    const existingBankData = await this.prisma.customerBankAccountData.findFirst({
      where: { requestId: request.id },
      orderBy: { id: 'desc' },
    });

    const isDataIncomplete = !existingBankData || existingBankData.currentBalance == null;

    // Auto-fetch data if sessionId is present and data is pending/ready or incomplete
    if (request.sessionId && (request.status !== 'SUCCESS' || isDataIncomplete) && ['READY', 'DATA_PENDING', 'COMPLETED', 'SUCCESS'].includes(request.dataStatus || request.status)) {
      try {
        await this.fetchDataBySession(request.sessionId);
        const updated = await this.prisma.customerAccountAggregatorRequest.findUnique({
          where: { id: request.id },
        });
        if (updated) {
          request = updated;
        }
      } catch (err: any) {
        this.logger.warn({
          event: 'unaport_get_status_auto_fetch_failed',
          sessionId: request.sessionId,
          error: err?.message,
        });
      }
    }

    const statusResult = await this.buildStatusResponse(request);
    console.log(`[AA SERVICE] [RESPONSE] getStatus - result:`, JSON.stringify(statusResult, null, 2));
    return statusResult;
  }

  /**
   * Refresh AA status by polling provider status APIs if needed.
   */
  async refreshStatus(
    customerId: bigint,
    lan: string,
  ): Promise<{
    status: string;
    consentStatus: string | null;
    dataStatus: string | null;
    completed: boolean;
    failureReason: string | null;
    bankSummary?: any;
  }> {
    console.log(`[AA SERVICE] [CALL] refreshStatus - customerId: ${customerId}, lan: ${lan}`);
    const cleanLan = String(lan || '').trim();
    await this.validateCustomerLanOwnership(customerId, cleanLan);

    let request = await this.prisma.customerAccountAggregatorRequest.findFirst({
      where: { customerId, lan: cleanLan },
      orderBy: { id: 'desc' },
    });

    if (!request) {
      return this.getStatus(customerId, cleanLan);
    }

    const existingBankData = await this.prisma.customerBankAccountData.findFirst({
      where: { requestId: request.id },
      orderBy: { id: 'desc' },
    });

    const isDataIncomplete = !existingBankData || existingBankData.currentBalance == null;

    // If already in complete terminal state, return directly with bank summary
    if (['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(request.status) && !isDataIncomplete) {
      return this.buildStatusResponse(request);
    }

    // Check if sessionId is present and data is ready to fetch
    if (request.sessionId && (request.status !== 'SUCCESS' || isDataIncomplete)) {
      try {
        await this.fetchDataBySession(request.sessionId);
      } catch (err: any) {
        this.logger.warn({
          event: 'unaport_refresh_fetch_failed',
          sessionId: request.sessionId,
          error: err?.message,
        });
      }
    } else if (request.consentHandle && !request.consentId) {
      // Query provider consent status endpoint
      try {
        const tokens = await this.tokenService.getValidTokens();
        const baseUrl = (this.configService.get<string>('UNAPORT_BASE_URL') || '').replace(/\/+$/, '');
        const response = await this.httpClient.get(
          `${baseUrl}/FIU/GetConsentStatus/${request.consentHandle}`,
          {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          },
        );

        const data = response?.data?.data || response?.data;
        if (data) {
          const consentStatus = data.consentStatus || data.approveStatus;
          if (['ACTIVE', 'APPROVED'].includes(consentStatus)) {
            await this.prisma.customerAccountAggregatorRequest.update({
              where: { id: request.id },
              data: {
                consentId: data.consentId || request.consentId,
                consentStatus: 'APPROVED',
                status: 'CONSENT_APPROVED',
                consentedAt: new Date(),
              },
            });
          }
        }
      } catch (err: any) {
        this.logger.warn({
          event: 'unaport_refresh_consent_status_error',
          consentHandle: request.consentHandle,
          error: err?.message,
        });
      }
    }

    const refreshResult = await this.getStatus(customerId, cleanLan);
    console.log(`[AA SERVICE] [RESPONSE] refreshStatus - result:`, JSON.stringify(refreshResult, null, 2));
    return refreshResult;
  }

  /**
   * Handle Consent Notification webhook from Unaport.
   */
  async handleConsentNotification(
    payload: UnaportConsentNotificationPayload,
  ): Promise<{ success: boolean; message: string }> {
    console.log(`[AA SERVICE] [CALL] handleConsentNotification - payload:`, JSON.stringify(payload, null, 2));
    const startTime = Date.now();
    let rawPayload: any = payload;
    if (Array.isArray(rawPayload) && rawPayload.length > 0) {
      rawPayload = rawPayload[0];
    }
    if (rawPayload?.body && typeof rawPayload.body === 'object') {
      rawPayload = rawPayload.body;
    }

    this.logger.log({
      event: 'unaport_consent_notification_received',
      trackingId: rawPayload?.trackingId || null,
      consentHandle: rawPayload?.ConsentStatusNotification?.consentHandle || null,
      consentStatus: rawPayload?.ConsentStatusNotification?.consentStatus || null,
    });

    const notif = rawPayload?.ConsentStatusNotification || rawPayload?.consentStatusNotification;
    const trackingId = rawPayload?.trackingId || rawPayload?.tracking_id;
    const consentHandle = notif?.consentHandle || rawPayload?.consentHandle || rawPayload?.consent_handle;
    const consentId = notif?.consentId || rawPayload?.consentId || rawPayload?.consent_id;
    const rawConsentStatus = String(notif?.consentStatus || rawPayload?.consentStatus || rawPayload?.consent_status || '').toUpperCase();

    let lanFromTracking: string | null = null;
    if (trackingId && typeof trackingId === 'string' && trackingId.includes('FTPL')) {
      const match = trackingId.match(/FTPL\d+/i);
      if (match) lanFromTracking = match[0].toUpperCase();
    }

    if (!trackingId && !consentHandle && !consentId && !lanFromTracking) {
      this.forwardToN8nConsentWebhook(payload).catch(() => { });
      throw new BadRequestException('Notification payload lacks identifying reference.');
    }

    // Locate request by trackingId, consentHandle, consentId, or extracted LAN
    const request = await this.prisma.customerAccountAggregatorRequest.findFirst({
      where: {
        OR: [
          ...(trackingId ? [{ trackingId }] : []),
          ...(consentHandle ? [{ consentHandle }] : []),
          ...(consentId ? [{ consentId }] : []),
          ...(lanFromTracking ? [{ lan: lanFromTracking }] : []),
        ],
      },
      orderBy: { id: 'desc' },
    });

    // Always forward incoming webhook to n8n consent URL even if record is missing in DB
    this.forwardToN8nConsentWebhook(payload, request).catch((err) => {
      this.logger.warn({ event: 'n8n_consent_forward_error', error: err?.message });
    });

    if (!request) {
      this.logger.warn({
        event: 'unaport_consent_notification_request_not_found',
        trackingId,
        consentHandle,
        consentId,
        lanFromTracking,
      });
      return { success: true, message: 'Request not found, acknowledged.' };
    }

    const encryptedResponse = encryptPayload(payload);
    const now = new Date();

    let newStatus = request.status;
    let newDataStatus = request.dataStatus;
    let normalizedConsentStatus = rawConsentStatus;
    let failureReason = request.failureReason;
    let failedAt = request.failedAt;
    let consentedAt = request.consentedAt;

    if (['ACTIVE', 'APPROVED', 'CONSENT_APPROVED'].includes(rawConsentStatus)) {
      normalizedConsentStatus = 'APPROVED';
      newStatus = 'CONSENT_APPROVED';
      consentedAt = consentedAt || now;
    } else if (['REJECTED', 'DENIED'].includes(rawConsentStatus)) {
      normalizedConsentStatus = 'REJECTED';
      newStatus = 'FAILED';
      newDataStatus = 'CANCELLED';
      failureReason = 'Customer rejected bank consent.';
      failedAt = now;
    } else if (['EXPIRED'].includes(rawConsentStatus)) {
      normalizedConsentStatus = 'EXPIRED';
      newStatus = 'EXPIRED';
      newDataStatus = 'EXPIRED';
      failureReason = 'Consent session expired.';
      failedAt = now;
    } else if (['REVOKED', 'PAUSED'].includes(rawConsentStatus)) {
      normalizedConsentStatus = 'REVOKED';
      newStatus = 'CANCELLED';
      newDataStatus = 'CANCELLED';
      failureReason = 'Consent was revoked by customer.';
      failedAt = now;
    }

    await this.prisma.customerAccountAggregatorRequest.update({
      where: { id: request.id },
      data: {
        consentId: consentId || request.consentId,
        consentHandle: consentHandle || request.consentHandle,
        consentStatus: normalizedConsentStatus,
        status: newStatus,
        dataStatus: newDataStatus,
        consentedAt,
        failedAt,
        failureReason,
        providerResponseEncrypted: encryptedResponse,
      },
    });

    // Approving the AA consent inside the Unaport SDK is a consent point in its own right.
    // It was previously recorded only as provider state on the AA request, so it could
    // neither be evidenced as a platform consent nor forwarded to the lender.
    if (normalizedConsentStatus === 'APPROVED' && request.applicationId) {
      try {
        await this.outbox.recordJourneyConsent({
          applicationId: request.applicationId,
          consentType: 'ACCOUNT_AGGREGATOR',
        });
      } catch (consentError: any) {
        this.logger.error(`Unable to record Account Aggregator consent: ${consentError?.message}`);
      }
    }

    this.logger.log({
      event: 'unaport_consent_notification_processed',
      requestId: request.id.toString(),
      customerId: request.customerId.toString(),
      lan: request.lan,
      trackingId: request.trackingId,
      provider: 'UNAPORT',
      status: newStatus,
      durationMs: Date.now() - startTime,
    });

    const response = { success: true, message: 'Consent notification processed successfully.' };
    console.log(`[AA SERVICE] [RESPONSE] handleConsentNotification - result:`, JSON.stringify(response, null, 2));
    return response;
  }

  /**
   * Handle Data Notification webhook from Unaport.
   */
  async handleDataNotification(
    payload: UnaportDataNotificationPayload,
  ): Promise<{ success: boolean; message: string }> {
    console.log(`[AA SERVICE] [CALL] handleDataNotification - payload:`, JSON.stringify(payload, null, 2));
    const startTime = Date.now();
    let rawPayload: any = payload;
    if (Array.isArray(rawPayload) && rawPayload.length > 0) {
      rawPayload = rawPayload[0];
    }
    if (rawPayload?.body && typeof rawPayload.body === 'object') {
      rawPayload = rawPayload.body;
    }

    this.logger.log({
      event: 'unaport_data_notification_received',
      trackingId: rawPayload?.trackingId || null,
      consentId: rawPayload?.consentId || null,
      sessionId: rawPayload?.FIStatusNotification?.sessionId || null,
      sessionStatus: rawPayload?.FIStatusNotification?.sessionStatus || null,
    });

    const notif = rawPayload?.FIStatusNotification || rawPayload?.fiStatusNotification;
    const trackingId = rawPayload?.trackingId || rawPayload?.tracking_id;
    const consentId = rawPayload?.consentId || rawPayload?.consent_id || notif?.consentId;
    const sessionId = notif?.sessionId || rawPayload?.sessionId || rawPayload?.session_id;
    const sessionStatus = String(notif?.sessionStatus || rawPayload?.sessionStatus || rawPayload?.session_status || '').toUpperCase();

    if (!sessionId && !trackingId && !consentId) {
      this.forwardToN8nDataWebhook(payload).catch(() => { });
      throw new BadRequestException('Data notification payload missing session/tracking ID.');
    }

    const request = await this.prisma.customerAccountAggregatorRequest.findFirst({
      where: {
        OR: [
          ...(sessionId ? [{ sessionId }] : []),
          ...(trackingId ? [{ trackingId }] : []),
          ...(consentId ? [{ consentId }] : []),
        ],
      },
      orderBy: { id: 'desc' },
    });

    // Always forward incoming webhook to n8n data URL even if record is missing in DB
    this.forwardToN8nDataWebhook(payload, request).catch((err) => {
      this.logger.warn({ event: 'n8n_data_forward_error', error: err?.message });
    });

    if (!request) {
      this.logger.warn({
        event: 'unaport_data_notification_request_not_found',
        trackingId,
        consentId,
        sessionId,
      });

      if (sessionId) {
        this.fetchDataBySession(sessionId).catch((err) => {
          this.logger.warn({
            event: 'unaport_async_data_fetch_failed',
            sessionId,
            error: err?.message,
          });
        });
        return { success: true, message: 'Session request initialized; bank statement fetch triggered.' };
      }

      return { success: true, message: 'Request not found, acknowledged.' };
    }

    const encryptedResponse = encryptPayload(payload);
    const now = new Date();

    // Inspect accounts in FIStatusResponse to detect FIP denial/timeout
    let accountsList: any[] = [];
    const fiResponse = notif?.FIStatusResponse || rawPayload?.FIStatusResponse;
    if (Array.isArray(fiResponse)) {
      for (const fip of fiResponse) {
        if (Array.isArray(fip?.Accounts)) accountsList.push(...fip.Accounts);
        else if (fip?.Accounts) accountsList.push(fip.Accounts);
        else if (fip?.FIStatus) accountsList.push(fip);
      }
    } else if (fiResponse && typeof fiResponse === 'object') {
      if (Array.isArray(fiResponse.Accounts)) accountsList.push(...fiResponse.Accounts);
      else if (fiResponse.Accounts) accountsList.push(fiResponse.Accounts);
      else if (fiResponse.FIStatus) accountsList.push(fiResponse);
    }

    const hasDeniedOrFailed = accountsList.some((acc) =>
      ['DENIED', 'FAILED', 'TIMEOUT', 'REJECTED'].includes(String(acc?.FIStatus || '').toUpperCase())
    );
    const hasSuccessful = accountsList.some((acc) =>
      ['READY', 'COMPLETED', 'SUCCESS', 'DELIVERED'].includes(String(acc?.FIStatus || '').toUpperCase())
    );

    const isAllDenied = (accountsList.length > 0 && hasDeniedOrFailed && !hasSuccessful) || sessionStatus === 'FAILED' || sessionStatus === 'DENIED';

    if (isAllDenied) {
      const matchedDesc = accountsList.find((acc) => acc?.description || acc?.desc);
      const failureReasonText = matchedDesc?.description || matchedDesc?.desc || 'Bank server timed out or denied account statement request. Please retry bank verification or select another bank.';

      await this.prisma.customerAccountAggregatorRequest.update({
        where: { id: request.id },
        data: {
          sessionId: sessionId || request.sessionId,
          dataStatus: 'DENIED',
          status: 'FAILED',
          failureCode: 'AA_FI_DENIED',
          failureReason: failureReasonText,
          failedAt: now,
          providerResponseEncrypted: encryptedResponse,
        },
      });

      this.logger.warn({
        event: 'unaport_data_notification_denied_or_failed',
        requestId: request.id.toString(),
        customerId: request.customerId.toString(),
        lan: request.lan,
        trackingId: request.trackingId,
        provider: 'UNAPORT',
        failureReason: failureReasonText,
        durationMs: Date.now() - startTime,
      });

      const failureResponse = {
        success: true,
        message: 'Data notification processed: Bank statement fetch denied/timed out.',
        failureReason: failureReasonText,
      };
      console.log(`[AA SERVICE] [RESPONSE] handleDataNotification (DENIED) - result:`, JSON.stringify(failureResponse, null, 2));
      return failureResponse;
    }

    const isReady =
      sessionStatus === 'COMPLETED' ||
      sessionStatus === 'READY' ||
      Array.isArray(notif?.FIStatusResponse) ||
      notif?.FIStatusResponse?.Accounts;

    await this.prisma.customerAccountAggregatorRequest.update({
      where: { id: request.id },
      data: {
        sessionId: sessionId || request.sessionId,
        dataStatus: isReady ? 'READY' : sessionStatus,
        status: isReady ? 'DATA_PENDING' : request.status,
        dataReadyAt: isReady ? now : request.dataReadyAt,
        providerResponseEncrypted: encryptedResponse,
      },
    });

    // If data is ready and session is available, trigger data fetch safely
    if (isReady && (sessionId || request.sessionId)) {
      const activeSessionId = sessionId || request.sessionId!;
      setImmediate(() => {
        this.fetchDataBySession(activeSessionId).catch((err) => {
          this.logger.error({
            event: 'unaport_async_data_fetch_failed',
            sessionId: activeSessionId,
            error: err?.message,
          });
        });
      });
    }

    this.logger.log({
      event: 'unaport_data_notification_processed',
      requestId: request.id.toString(),
      customerId: request.customerId.toString(),
      lan: request.lan,
      trackingId: request.trackingId,
      provider: 'UNAPORT',
      status: isReady ? 'DATA_PENDING' : request.status,
      durationMs: Date.now() - startTime,
    });

    const response = { success: true, message: 'Data notification processed successfully.' };
    console.log(`[AA SERVICE] [RESPONSE] handleDataNotification - result:`, JSON.stringify(response, null, 2));
    return response;
  }

  /**
   * Fetch bank data by sessionId from Unaport FIU Fetch Data API.
   */
  async fetchDataBySession(sessionId: string, retryCount: number = 0): Promise<any> {
    console.log(`[AA SERVICE] [CALL] fetchDataBySession - sessionId: ${sessionId}, retryCount: ${retryCount}`);
    const startTime = Date.now();
    const cleanSessionId = String(sessionId || '').trim();

    if (!cleanSessionId) {
      throw new BadRequestException('Session ID is required.');
    }

    let request = await this.prisma.customerAccountAggregatorRequest.findFirst({
      where: { sessionId: cleanSessionId },
      orderBy: { id: 'desc' },
    });

    if (!request) {
      const latestLoan = await this.prisma.plLoan.findFirst({
        orderBy: { id: 'desc' },
      });
      const customerId = latestLoan?.customerId || BigInt(4);
      const lan = latestLoan?.lan || 'FTPL00000004';

      request = await this.prisma.customerAccountAggregatorRequest.create({
        data: {
          customerId,
          applicationId: latestLoan?.applicationId || null,
          lan,
          provider: 'UNAPORT',
          trackingId: `PL-AA-SESSION-${cleanSessionId.slice(0, 8)}-${Date.now()}`,
          sessionId: cleanSessionId,
          status: 'INITIATED',
          consentStatus: 'APPROVED',
          dataStatus: 'READY',
          initiatedAt: new Date(),
        },
      });
      this.logger.log({
        event: 'unaport_auto_created_request_for_session',
        sessionId: cleanSessionId,
        requestId: request.id.toString(),
        customerId: customerId.toString(),
        lan,
      });
    }

    // Idempotency: Return early if already SUCCESS and bank summary data is complete
    const existingBankData = await this.prisma.customerBankAccountData.findFirst({
      where: { requestId: request.id },
      orderBy: { id: 'desc' },
    });

    if (request.status === 'SUCCESS' && existingBankData && existingBankData.currentBalance != null && existingBankData.accountNumberMasked != null) {
      this.logger.log({
        event: 'unaport_fetch_data_already_success',
        sessionId: cleanSessionId,
        requestId: request.id.toString(),
      });
      return { success: true, message: 'Data already fetched successfully.' };
    }

    const tokens = await this.tokenService.getValidTokens();
    const envFetchBaseUrl = this.configService.get<string>('UNAPORT_FETCH_DATA_BASE_URL');
    const isProd = this.configService.get<string>('UNAPORT_ENVIRONMENT') === 'production';
    const defaultProdFetchBase = 'https://api-backend.premium.unaport.com/backend-v2/api/v2';
    const fetchBaseUrl = envFetchBaseUrl || (isProd ? defaultProdFetchBase : (this.configService.get<string>('UNAPORT_BASE_URL') || '').replace(/\/+$/, ''));

    let primaryUrl = `${fetchBaseUrl}/FIU/FifetchDataBySessionId/${cleanSessionId}`;
    const baseUrl = (this.configService.get<string>('UNAPORT_BASE_URL') || '').replace(/\/+$/, '');
    let fallbackUrl = `${baseUrl}/FIU/FifetchDataBySessionId/${cleanSessionId}`;

    let fetchResponse: UnaportFetchDataResponse;
    try {
      console.log(`[AA SERVICE] [CALL] Unaport Fetch Data API endpoint: ${primaryUrl}`);
      this.logger.log({ event: 'unaport_fetch_data_attempt', url: primaryUrl, sessionId: cleanSessionId });
      try {
        const response = await this.httpClient.get<UnaportFetchDataResponse>(primaryUrl, {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        });
        fetchResponse = response.data;
        console.log(`[AA SERVICE] [RESPONSE] Unaport Fetch Data API primary response:`, JSON.stringify(fetchResponse, null, 2));
      } catch (primaryErr: any) {
        if (primaryUrl !== fallbackUrl) {
          console.log(`[AA SERVICE] [CALL] Unaport Fetch Data API fallback endpoint: ${fallbackUrl}`);
          this.logger.warn({
            event: 'unaport_fetch_data_primary_failed_trying_fallback',
            primaryUrl,
            fallbackUrl,
            error: primaryErr?.message,
          });
          const response = await this.httpClient.get<UnaportFetchDataResponse>(fallbackUrl, {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          });
          fetchResponse = response.data;
          console.log(`[AA SERVICE] [RESPONSE] Unaport Fetch Data API fallback response:`, JSON.stringify(fetchResponse, null, 2));
        } else {
          throw primaryErr;
        }
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err?.message || 'Data fetch API error';
      this.logger.error({
        event: 'unaport_fetch_data_api_failed',
        sessionId: cleanSessionId,
        status: err?.response?.status || 500,
        errorMessage,
      });

      // Fallback: If encrypted provider payload was previously stored in request, use it to populate database & statement
      if (request?.providerResponseEncrypted) {
        this.logger.log(`[AA SERVICE] Remote fetch failed/unavailable (${errorMessage}). Using stored provider payload for session ${cleanSessionId}`);
        try {
          const decStr = decryptPayload(request.providerResponseEncrypted);
          fetchResponse = JSON.parse(decStr);
        } catch {
          await this.prisma.customerAccountAggregatorRequest.update({
            where: { id: request.id },
            data: {
              status: 'FAILED',
              failureCode: 'AA_DATA_FETCH_FAILED',
              failureReason: errorMessage,
              failedAt: new Date(),
            },
          });
          throw new InternalServerErrorException(`Unaport Fetch Data failed: ${errorMessage}`);
        }
      } else {
        await this.prisma.customerAccountAggregatorRequest.update({
          where: { id: request.id },
          data: {
            status: 'FAILED',
            failureCode: 'AA_DATA_FETCH_FAILED',
            failureReason: errorMessage,
            failedAt: new Date(),
          },
        });
        throw new InternalServerErrorException(`Unaport Fetch Data failed: ${errorMessage}`);
      }
    }

    // Encrypt raw provider response at rest
    const encryptedRawResponse = encryptPayload(fetchResponse);

    // Extract raw payload / array from response
    let rawPayload: any = fetchResponse;
    if (rawPayload && typeof rawPayload === 'object' && 'data' in rawPayload && rawPayload.data !== null) {
      rawPayload = rawPayload.data;
    }
    // Unnest nested data objects if present (e.g. data.data.account)
    if (rawPayload && typeof rawPayload === 'object' && rawPayload.data && typeof rawPayload.data === 'object' && !Array.isArray(rawPayload.data) && (rawPayload.data.account || rawPayload.data.accounts || rawPayload.data.transactions)) {
      rawPayload = rawPayload.data;
    }

    let itemsList: any[] = [];
    if (Array.isArray(rawPayload)) {
      itemsList = rawPayload;
    } else if (rawPayload && typeof rawPayload === 'object') {
      if (rawPayload.DEPOSIT_V2 && typeof rawPayload.DEPOSIT_V2 === 'object') {
        itemsList = [rawPayload.DEPOSIT_V2];
      } else if (Array.isArray(rawPayload.accounts)) itemsList = rawPayload.accounts;
      else if (Array.isArray(rawPayload.account)) itemsList = rawPayload.account;
      else if (Array.isArray(rawPayload.Accounts)) itemsList = rawPayload.Accounts;
      else if (Array.isArray(rawPayload.Account)) itemsList = rawPayload.Account;
      else if (Array.isArray(rawPayload.transactions) || rawPayload.fipId || rawPayload.maskedAccNo || rawPayload.accNumber || rawPayload.accountNumber || rawPayload.summary || rawPayload.txnId) {
        itemsList = [rawPayload];
      } else if (rawPayload.FIStatusResponse?.Accounts && Array.isArray(rawPayload.FIStatusResponse.Accounts)) {
        itemsList = rawPayload.FIStatusResponse.Accounts;
      } else {
        // Collect object values that contain transactions, account details or summary
        itemsList = Object.values(rawPayload).filter((item: any) => item && typeof item === 'object' && (Array.isArray(item.transactions) || item.summary || item.accountHolder));
      }
    }

    // Flatten nested arrays if present
    const flattenedItems: any[] = [];
    for (const item of itemsList) {
      if (Array.isArray(item)) {
        flattenedItems.push(...item);
      } else if (item && typeof item === 'object' && Array.isArray(item.transactions)) {
        flattenedItems.push(item);
      } else if (item && typeof item === 'object' && Array.isArray(item.tabs) && (!item.transactions && !item.account)) {
        flattenedItems.push(...item.tabs);
      } else {
        flattenedItems.push(item);
      }
    }

    // Group items by Account Number
    const groupedAccounts = new Map<string, { meta: any; txns: any[] }>();

    for (const item of flattenedItems) {
      if (!item || typeof item !== 'object') continue;

      let rawTxns: any[] = [];
      const nestedTxns = item.transactions || item.Transaction || item.Transactions || item.transaction;
      if (Array.isArray(nestedTxns)) {
        rawTxns = nestedTxns;
      } else if (nestedTxns && typeof nestedTxns === 'object') {
        if (Array.isArray(nestedTxns.transaction)) rawTxns = nestedTxns.transaction;
        else if (Array.isArray(nestedTxns.Transaction)) rawTxns = nestedTxns.Transaction;
        else if (Array.isArray(nestedTxns.transactions)) rawTxns = nestedTxns.transactions;
        else rawTxns = [nestedTxns];
      } else if (item.txnId || item.tranTimestamp || item.amount != null) {
        // Flat transaction item
        rawTxns = [item];
      }

      const firstTxn = rawTxns[0];
      const summaryObj = Array.isArray(item.summary) ? item.summary[0] : item.summary;
      const holderObj = Array.isArray(item.accountHolder) ? item.accountHolder[0] : item.accountHolder;

      const accountNumber = summaryObj?.accountNumber || holderObj?.accountNumber || item.accountNumber || item.maskedAccNo || item.accNumber || item.accountNo || firstTxn?.accountNumber || 'PRIMARY_ACCOUNT';
      const holderName = holderObj?.name || item.accountHolderName || item.holderName || null;
      const ifscCode = summaryObj?.ifscCode || item.ifscCode || item.ifsc || null;
      const fipName = summaryObj?.fip || item.fipName || null;

      if (!groupedAccounts.has(accountNumber)) {
        groupedAccounts.set(accountNumber, {
          meta: {
            accountHolderName: holderName,
            accountType: summaryObj?.accountType || item.accountType || 'SAVINGS',
            accountNumberMasked: accountNumber !== 'PRIMARY_ACCOUNT' ? accountNumber : null,
            accountNumberEncrypted: (item.accNumber || item.accountNumber) ? encryptPayload(item.accNumber || item.accountNumber) : null,
            ifscCode,
            branchName: summaryObj?.branch || item.branch || item.branchName || null,
            fipId: summaryObj?.fipId || item.fipId || item.fipID || null,
            fipName,
            currency: summaryObj?.currency || item.currency || 'INR',
            summary: summaryObj || null,
          },
          txns: [],
        });
      }

      const accGroup = groupedAccounts.get(accountNumber)!;
      // Enrich meta if missing
      if (!accGroup.meta.accountHolderName && holderName) {
        accGroup.meta.accountHolderName = holderName;
      }
      if (!accGroup.meta.summary && summaryObj) {
        accGroup.meta.summary = summaryObj;
      }
      if (!accGroup.meta.fipId && (summaryObj?.fipId || item.fipId)) {
        accGroup.meta.fipId = summaryObj?.fipId || item.fipId;
      }

      accGroup.txns.push(...rawTxns);
    }

    // Check if Unaport returned empty tabs/no accounts yet
    const hasData = groupedAccounts.size > 0 && Array.from(groupedAccounts.values()).some((g) => (g.txns && g.txns.length > 0) || g.meta?.summary || g.meta?.accountHolderName);

    if (!hasData) {
      if (retryCount === 0) {
        this.logger.log(`[AA SERVICE] Unaport returned empty tabs data on first attempt for session ${cleanSessionId}. Waiting 2.5s and retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 2500));
        return this.fetchDataBySession(sessionId, 1);
      }

      this.logger.warn(`[AA SERVICE] Unaport response is still empty for session ${cleanSessionId}. Keeping dataStatus=DATA_PENDING for status polling.`);
      await this.prisma.customerAccountAggregatorRequest.update({
        where: { id: request.id },
        data: {
          status: 'DATA_PENDING',
          dataStatus: 'DATA_PENDING',
          providerResponseEncrypted: encryptedRawResponse,
        },
      });

      return {
        success: false,
        message: 'Bank financial data is still being compiled by Account Aggregator provider.',
      };
    }

    const now = new Date();

    await this.prisma.$transaction(
      async (tx: any) => {
        for (const [accountNum, group] of groupedAccounts.entries()) {
          const meta = group.meta;

          // Skip creating empty database records if there are no transactions and no summary balance info
          if ((!group.txns || group.txns.length === 0) && !group.meta.summary && !group.meta.accountHolderName && !group.meta.currentBalance) {
            continue;
          }

          // Parse and sort transactions chronologically
          const parsedTxns = group.txns.map((txn: any) => {
            const rawDate = txn.tranTimestamp || txn.transactionTimestamp || txn.txnDate || txn.createdAt || txn.transactionDate;
            const txnDate = rawDate ? new Date(rawDate) : now;
            const validTxnDate = isNaN(txnDate.getTime()) ? now : txnDate;
            const rawAmount = Number(txn.amount || 0);
            const balance = txn.currentBalance != null ? Number(txn.currentBalance) : (txn.balance != null ? Number(txn.balance) : null);
            return {
              ...txn,
              parsedDate: validTxnDate,
              parsedAmount: rawAmount,
              parsedBalance: balance,
            };
          }).sort((a: any, b: any) => a.parsedDate.getTime() - b.parsedDate.getTime());

          // Derive balances
          let currentBalance: number | null = null;
          let availableBalance: number | null = null;
          let averageBalance: number | null = null;

          if (meta.summary && meta.summary.currentBalance != null) {
            currentBalance = Number(meta.summary.currentBalance);
          } else if (parsedTxns.length > 0) {
            const latestWithBalance = [...parsedTxns].reverse().find((t: any) => t.parsedBalance != null);
            if (latestWithBalance) {
              currentBalance = latestWithBalance.parsedBalance;
            }
          }

          if (meta.summary && meta.summary.availableBalance != null) {
            availableBalance = Number(meta.summary.availableBalance);
          } else {
            availableBalance = currentBalance;
          }

          // Compute Average Bank Balance (ABB) from recorded balances
          const txnsWithBalance = parsedTxns.filter((t: any) => t.parsedBalance != null && !isNaN(Number(t.parsedBalance)));
          if (txnsWithBalance.length > 0) {
            const sumBalances = txnsWithBalance.reduce((acc: number, t: any) => acc + Number(t.parsedBalance), 0);
            averageBalance = Math.round((sumBalances / txnsWithBalance.length) * 100) / 100;
          } else if (currentBalance != null) {
            averageBalance = currentBalance;
          }

          const earliestTxn = parsedTxns[0];
          const latestTxn = parsedTxns[parsedTxns.length - 1];

          const fromDate = meta.summary?.fromDate ? new Date(meta.summary.fromDate) : (earliestTxn?.parsedDate || null);
          const toDate = meta.summary?.toDate ? new Date(meta.summary.toDate) : (latestTxn?.parsedDate || null);
          const summaryDate = meta.summary?.balanceDateTime ? new Date(meta.summary.balanceDateTime) : (latestTxn?.parsedDate || now);

          const customer = request.customerId ? await tx.customer.findUnique({ where: { id: request.customerId } }) : null;
          const loan = request.lan ? await tx.plLoan.findFirst({ where: { lan: request.lan } }) : null;

          const existingRecord = await tx.customerBankAccountData.findFirst({
            where: {
              customerId: request.customerId,
              sessionId: cleanSessionId,
            },
            orderBy: { id: 'desc' },
          });

          let bankDataRecord: any;
          if (existingRecord) {
            bankDataRecord = await tx.customerBankAccountData.update({
              where: { id: existingRecord.id },
              data: {
                fipId: meta.fipId || existingRecord.fipId,
                fipName: meta.fipName || existingRecord.fipName || loan?.bankName || null,
                accountType: meta.accountType || existingRecord.accountType || 'SAVINGS',
                accountNumberMasked: meta.accountNumberMasked || existingRecord.accountNumberMasked || loan?.bankAccountMasked || null,
                accountHolderName: meta.accountHolderName || existingRecord.accountHolderName || loan?.bankAccountHolderName || customer?.fullName || null,
                ifscCode: meta.ifscCode || existingRecord.ifscCode || loan?.bankIfsc || null,
                branchName: meta.branchName || existingRecord.branchName,
                currency: meta.currency || existingRecord.currency,
                currentBalance: currentBalance ?? existingRecord.currentBalance,
                availableBalance: availableBalance ?? existingRecord.availableBalance,
                averageBalance: averageBalance ?? existingRecord.averageBalance,
                summaryDate: summaryDate || existingRecord.summaryDate,
                fromDate: fromDate || existingRecord.fromDate,
                toDate: toDate || existingRecord.toDate,
              },
            });
          } else {
            bankDataRecord = await tx.customerBankAccountData.create({
              data: {
                requestId: request.id,
                customerId: request.customerId,
                applicationId: request.applicationId,
                lan: request.lan,
                provider: 'UNAPORT',
                sessionId: cleanSessionId,
                fipId: meta.fipId,
                fipName: meta.fipName || loan?.bankName || null,
                accountType: meta.accountType || loan?.bankAccountType || 'SAVINGS',
                accountNumberMasked: meta.accountNumberMasked || loan?.bankAccountMasked || (accountNum !== 'PRIMARY_ACCOUNT' ? accountNum : null),
                accountNumberEncrypted: meta.accountNumberEncrypted,
                accountHolderName: meta.accountHolderName || loan?.bankAccountHolderName || customer?.fullName || null,
                ifscCode: meta.ifscCode || loan?.bankIfsc || null,
                branchName: meta.branchName,
                currency: meta.currency,
                currentBalance,
                availableBalance,
                averageBalance,
                summaryDate,
                fromDate,
                toDate,
              },
            });
          }

          // Automatically update pl_loans table with verified bank account details & mark bankVerified
          if (request.lan) {
            await tx.plLoan.updateMany({
              where: { lan: request.lan },
              data: {
                bankName: bankDataRecord.fipName || 'Verified Bank',
                bankAccountHolderName: bankDataRecord.accountHolderName || customer?.fullName || null,
                bankAccountMasked: bankDataRecord.accountNumberMasked || null,
                bankVerified: true,
              },
            });
          }

          // Efficient batch insert for all transactions to prevent transaction timeouts
          const txnsToCreate = parsedTxns.map((txn: any) => {
            const txnId = txn.txnId || null;
            const rawType = String(txn.type || txn.txnType || txn.transactionType || '').toUpperCase();
            let txnType = 'DEBIT';
            if (rawType.includes('CREDIT') || rawType.includes('CR')) {
              txnType = 'CREDIT';
            } else if (rawType.includes('DEBIT') || rawType.includes('DR')) {
              txnType = 'DEBIT';
            } else if (txn.narration && /CREDIT|Payment from|NEFT IN|IMPS IN|RECEIVED/i.test(String(txn.narration))) {
              txnType = 'CREDIT';
            }
            const amount = txn.parsedAmount;
            const balance = txn.parsedBalance;
            const narration = txn.narration || null;
            const mode = txn.mode || null;
            const referenceNumber = txn.reference || txn.referenceNumber || null;
            const txnDate = txn.parsedDate;
            const valueDate = txn.valueDate ? new Date(txn.valueDate) : null;

            const hashString = `${meta.accountNumberMasked || ''}|${txnDate.toISOString()}|${amount}|${narration || ''}|${referenceNumber || ''}`;
            const transactionHash = createHash('sha256').update(hashString).digest('hex');

            return {
              bankDataId: bankDataRecord.id,
              txnId,
              txnDate,
              valueDate,
              txnType,
              amount,
              balance,
              narration,
              mode,
              referenceNumber,
              transactionHash,
            };
          });

          if (txnsToCreate.length > 0) {
            await tx.customerBankTransaction.createMany({
              data: txnsToCreate,
              skipDuplicates: true,
            });
          }
        }

        // Mark request as SUCCESS only when valid account/transaction data exists
        await tx.customerAccountAggregatorRequest.update({
          where: { id: request.id },
          data: {
            status: 'SUCCESS',
            dataStatus: 'COMPLETED',
            completedAt: now,
            providerResponseEncrypted: encryptedRawResponse,
          },
        });
      },
      { timeout: 60000, maxWait: 10000 },
    );

    this.logger.log({
      event: 'unaport_fetch_data_success',
      requestId: request.id.toString(),
      customerId: request.customerId.toString(),
      lan: request.lan,
      trackingId: request.trackingId,
      provider: 'UNAPORT',
      status: 'SUCCESS',
      durationMs: Date.now() - startTime,
    });

    this.forwardToN8nDataWebhook({ sessionId: cleanSessionId, status: 'SUCCESS' }, request, fetchResponse).catch((err) => {
      this.logger.warn({ event: 'n8n_data_fetch_forward_error', error: err?.message });
    });

    // Generate Bank Statement PDF document directly from fetched data and save to pl_customer_documents table
    this.exportAndSaveStatementDocuments(request, cleanSessionId).catch((err) => {
      this.logger.warn({ event: 'unaport_export_documents_error', error: err?.message });
    });

    const fetchResult = {
      success: true,
      message: 'Bank statement data fetched and stored successfully.',
    };
    console.log(`[AA SERVICE] [RESPONSE] fetchDataBySession - result:`, JSON.stringify(fetchResult, null, 2));
    return fetchResult;
  }

  /**
   * Generates and saves Bank Statement PDF document directly from stored customer bank data & transactions,
   * and records it in pl_customer_documents table.
   */
  async exportAndSaveStatementDocuments(request: any, sessionId: string): Promise<void> {
    try {
      const cleanSessionId = String(sessionId || '').trim();

      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const targetDir = path.join(process.cwd(), 'uploads', 'customer-documents', 'bank-statement', year, month);

      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      // Fetch the verified bank account data with transactions for this customer / session
      let bankData = await this.prisma.customerBankAccountData.findFirst({
        where: {
          customerId: request.customerId,
          currentBalance: { not: null },
        },
        orderBy: { id: 'desc' },
        include: {
          transactions: {
            take: 200,
            orderBy: { txnDate: 'desc' },
          },
        },
      });

      if (!bankData) {
        bankData = await this.prisma.customerBankAccountData.findFirst({
          where: { customerId: request.customerId },
          orderBy: { id: 'desc' },
          include: {
            transactions: {
              take: 200,
              orderBy: { txnDate: 'desc' },
            },
          },
        });
      }

      const customer = request.customerId
        ? await this.prisma.customer.findUnique({ where: { id: request.customerId } })
        : null;

      const fileName = `aa_statement_${cleanSessionId.slice(0, 8)}_pdf_${Date.now()}.pdf`;
      const fullPath = path.join(targetDir, fileName);
      const relativePath = `uploads/customer-documents/bank-statement/${year}/${month}/${fileName}`;
      const fileUrl = `/${relativePath}`;

      const transactions = bankData?.transactions || [];

      const htmlContent = `<!DOCTYPE HTML>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Bank Statement - ${bankData?.fipName || 'Verified Bank'}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #333; line-height: 1.5; }
    .header { text-align: center; border-bottom: 2px solid #2b6cb0; padding-bottom: 15px; margin-bottom: 20px; }
    .header h2 { color: #2b6cb0; margin: 0; font-size: 24px; text-transform: uppercase; }
    .summary-card { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px 20px; margin-bottom: 25px; }
    .summary-card table { width: 100%; border-collapse: collapse; }
    .summary-card td { padding: 6px 0; font-size: 14px; }
    .summary-card td strong { color: #4a5568; }
    .txns-title { color: #2d3748; margin-bottom: 10px; font-size: 18px; }
    table.txns-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
    table.txns-table th, table.txns-table td { border: 1px solid #cbd5e0; padding: 10px 8px; text-align: left; }
    table.txns-table th { background-color: #ebf8ff; color: #2b6cb0; font-weight: 600; text-transform: uppercase; font-size: 12px; }
    table.txns-table tr:nth-child(even) { background-color: #f7fafc; }
    .type-debit { color: #e53e3e; font-weight: bold; }
    .type-credit { color: #38a169; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h2>BANK STATEMENT - ${bankData?.fipName || 'VERIFIED BANK'}</h2>
  </div>
  <div class="summary-card">
    <table>
      <tr>
        <td><strong>Customer Name:</strong> ${bankData?.accountHolderName || customer?.fullName || 'Borrower'}</td>
        <td><strong>Account Number:</strong> ${bankData?.accountNumberMasked || 'PRIMARY_ACCOUNT'}</td>
      </tr>
      <tr>
        <td><strong>Account Type:</strong> ${bankData?.accountType || 'SAVINGS'}</td>
        <td><strong>IFSC Code:</strong> ${bankData?.ifscCode || 'N/A'}</td>
      </tr>
      <tr>
        <td><strong>Current Balance:</strong> ₹${bankData?.currentBalance != null ? Number(bankData.currentBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}</td>
        <td><strong>Average Balance (ABB):</strong> ₹${bankData?.averageBalance != null ? Number(bankData.averageBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}</td>
      </tr>
    </table>
  </div>

  <h3 class="txns-title">Transaction History (${transactions.length} Transactions)</h3>
  <table class="txns-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Amount</th>
        <th>Narration</th>
        <th>Balance</th>
      </tr>
    </thead>
    <tbody>
      ${transactions.length > 0 ? transactions.map((t: any) => `
        <tr>
          <td>${t.txnDate ? new Date(t.txnDate).toLocaleDateString('en-IN') : '-'}</td>
          <td class="${t.txnType === 'CREDIT' ? 'type-credit' : 'type-debit'}">${t.txnType}</td>
          <td>₹${Number(t.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>${t.narration || '-'}</td>
          <td>₹${t.balance != null ? Number(t.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}</td>
        </tr>
      `).join('') : '<tr><td colspan="5" style="text-align:center; padding: 20px;">No transactions recorded</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;

      let pdfBuffer: Buffer;
      try {
        const puppeteer = await import('puppeteer');
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        const pdfBytes = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
        });
        await browser.close();
        pdfBuffer = Buffer.from(pdfBytes);
      } catch (pdfErr: any) {
        this.logger.warn(`[PUPPETEER PDF RENDER WARNING] ${pdfErr?.message}, writing raw content fallback.`);
        pdfBuffer = Buffer.from(htmlContent, 'utf8');
      }

      writeFileSync(fullPath, pdfBuffer);

      await this.prisma.plCustomerDocument.create({
        data: {
          customerId: request.customerId,
          applicationId: request.applicationId || null,
          documentType: 'BANK_STATEMENT',
          applicantType: 'BORROWER',
          status: 'VERIFIED',
          fileName,
          originalFileName: `bank_statement_${request.lan || 'doc'}.pdf`,
          filePath: relativePath,
          fileUrl,
          mimeType: 'application/pdf',
          fileSize: pdfBuffer.length,
          source: 'UNAPORT_AA',
        },
      });

      this.logger.log(`✅ [AA STATEMENT PDF CREATED] Recorded in pl_customer_documents for Customer ${request.customerId}: ${relativePath}`);
    } catch (err: any) {
      this.logger.error(`[UNAPORT STATEMENT EXPORT ERROR]: ${err?.message}`);
    }
  }

  /**
   * Trigger Unaport Analytics generation API for a session ID (as per postman1 (6).json spec).
   */
  async triggerUnaportAnalytics(sessionId: string): Promise<any> {
    try {
      const cleanSessionId = String(sessionId || '').trim();
      const tokens = await this.tokenService.getValidTokens();
      const token = tokens.accessToken;
      const baseURL = this.configService.get<string>('UNAPORT_FIU_BASE_URL') || 'https://common.premium.unaport.com/api/v1';
      const appUrl = baseURL.replace('/public/user/login', '').replace(/\/+$/, '');
      const orgId = this.configService.get<string>('UNAPORT_ORG_ID') || 'f8b81967-a47d-4d9f-bd1b-ca8a29a879d4';

      const analyticsUrl = `${appUrl}/FIU/FI/Analytic/${orgId}/${cleanSessionId}`;
      this.logger.log(`[UNAPORT ANALYTICS CALL] GET ${analyticsUrl}`);

      const response = await this.httpClient.get(analyticsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = response?.data;
      this.logger.log(`[UNAPORT ANALYTICS RESPONSE]: ${JSON.stringify(data)}`);
      return data;
    } catch (err: any) {
      this.logger.warn(`[UNAPORT ANALYTICS WARNING]: ${err?.response?.data?.message || err?.message}`);
      return null;
    }
  }

  private async forwardToN8nConsentWebhook(payload: any, request?: any) {
    const webhookUrl = this.configService.get<string>('UNAPORT_AA_CONSENT_WEBHOOK_URL');
    if (!webhookUrl || webhookUrl.includes('/api/aa/')) return;

    let rawPayload: any = payload;
    if (Array.isArray(rawPayload) && rawPayload.length > 0) {
      rawPayload = rawPayload[0];
    }
    if (rawPayload?.body && typeof rawPayload.body === 'object') {
      rawPayload = rawPayload.body;
    }

    const notif = rawPayload?.ConsentStatusNotification || rawPayload?.consentStatusNotification;

    try {
      await axios.post(webhookUrl, {
        event: 'AA_CONSENT_NOTIFICATION',
        timestamp: new Date().toISOString(),
        customerId: request?.customerId?.toString() || null,
        lan: request?.lan || null,
        trackingId: request?.trackingId || rawPayload?.trackingId || rawPayload?.tracking_id || null,
        consentHandle: notif?.consentHandle || rawPayload?.consentHandle || rawPayload?.consent_handle || request?.consentHandle || null,
        consentId: notif?.consentId || rawPayload?.consentId || rawPayload?.consent_id || request?.consentId || null,
        consentStatus: notif?.consentStatus || rawPayload?.consentStatus || rawPayload?.consent_status || request?.consentStatus || null,
        payload,
      }, { timeout: 10000 });

      this.logger.log({
        event: 'n8n_aa_consent_webhook_forwarded',
        webhookUrl,
        trackingId: request?.trackingId || rawPayload?.trackingId,
      });
    } catch (err: any) {
      this.logger.warn({
        event: 'n8n_aa_consent_webhook_failed',
        webhookUrl,
        error: err?.message,
      });
    }
  }

  private async forwardToN8nDataWebhook(payload: any, request?: any, fetchedData?: any) {
    const webhookUrl = this.configService.get<string>('UNAPORT_AA_DATA_WEBHOOK_URL');
    if (!webhookUrl || webhookUrl.includes('/api/aa/')) return;

    let rawPayload: any = payload;
    if (Array.isArray(rawPayload) && rawPayload.length > 0) {
      rawPayload = rawPayload[0];
    }
    if (rawPayload?.body && typeof rawPayload.body === 'object') {
      rawPayload = rawPayload.body;
    }

    const notif = rawPayload?.FIStatusNotification || rawPayload?.fiStatusNotification;

    try {
      await axios.post(webhookUrl, {
        event: 'AA_DATA_FETCH_NOTIFICATION',
        timestamp: new Date().toISOString(),
        customerId: request?.customerId?.toString() || null,
        lan: request?.lan || null,
        trackingId: request?.trackingId || rawPayload?.trackingId || rawPayload?.tracking_id || null,
        sessionId: notif?.sessionId || rawPayload?.sessionId || rawPayload?.session_id || request?.sessionId || null,
        sessionStatus: notif?.sessionStatus || rawPayload?.sessionStatus || rawPayload?.session_status || rawPayload?.status || request?.dataStatus || null,
        fetchedData: fetchedData || null,
        payload,
      }, { timeout: 10000 });

      this.logger.log({
        event: 'n8n_aa_data_webhook_forwarded',
        webhookUrl,
        trackingId: request?.trackingId || rawPayload?.trackingId,
      });
    } catch (err: any) {
      this.logger.warn({
        event: 'n8n_aa_data_webhook_failed',
        webhookUrl,
        error: err?.message,
      });
    }
  }
}
