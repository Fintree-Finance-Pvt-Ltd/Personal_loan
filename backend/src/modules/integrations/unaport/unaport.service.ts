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
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { encryptPayload } from '../../../common/utils/bank-security.helper';
import { UnaportTokenService } from './unaport-token.service';
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
      accessToken: '',
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
  }> {
    console.log(`[AA SERVICE] [CALL] getStatus - customerId: ${customerId}, lan: ${lan}`);
    const cleanLan = String(lan || '').trim();
    await this.validateCustomerLanOwnership(customerId, cleanLan);

    const request = await this.prisma.customerAccountAggregatorRequest.findFirst({
      where: { customerId, lan: cleanLan },
      orderBy: { id: 'desc' },
    });

    if (!request) {
      return {
        status: 'NOT_STARTED',
        consentStatus: null,
        dataStatus: null,
        completed: false,
        failureReason: null,
      };
    }

    // Auto-fetch data if sessionId is present and data is pending/ready
    if (request.sessionId && request.status !== 'SUCCESS' && ['READY', 'DATA_PENDING', 'COMPLETED'].includes(request.dataStatus || request.status)) {
      try {
        await this.fetchDataBySession(request.sessionId);
        const updated = await this.prisma.customerAccountAggregatorRequest.findUnique({
          where: { id: request.id },
        });
        if (updated) {
          return {
            status: updated.status,
            consentStatus: updated.consentStatus,
            dataStatus: updated.dataStatus,
            completed: updated.status === 'SUCCESS',
            failureReason: updated.failureReason,
          };
        }
      } catch (err: any) {
        this.logger.warn({
          event: 'unaport_get_status_auto_fetch_failed',
          sessionId: request.sessionId,
          error: err?.message,
        });
      }
    }

    const statusResult = {
      status: request.status,
      consentStatus: request.consentStatus,
      dataStatus: request.dataStatus,
      completed: request.status === 'SUCCESS',
      failureReason: request.failureReason,
    };
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
  }> {
    console.log(`[AA SERVICE] [CALL] refreshStatus - customerId: ${customerId}, lan: ${lan}`);
    const cleanLan = String(lan || '').trim();
    await this.validateCustomerLanOwnership(customerId, cleanLan);

    const request = await this.prisma.customerAccountAggregatorRequest.findFirst({
      where: { customerId, lan: cleanLan },
      orderBy: { id: 'desc' },
    });

    if (!request) {
      return this.getStatus(customerId, cleanLan);
    }

    // If already in terminal state, return directly
    if (['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(request.status)) {
      return {
        status: request.status,
        consentStatus: request.consentStatus,
        dataStatus: request.dataStatus,
        completed: request.status === 'SUCCESS',
        failureReason: request.failureReason,
      };
    }

    // Check if sessionId is present and data is ready to fetch
    if (request.sessionId && request.status !== 'SUCCESS') {
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

    if (!trackingId && !consentHandle && !consentId) {
      this.forwardToN8nConsentWebhook(payload).catch(() => { });
      throw new BadRequestException('Notification payload lacks identifying reference.');
    }

    // Locate request by trackingId, consentHandle, or consentId
    const request = await this.prisma.customerAccountAggregatorRequest.findFirst({
      where: {
        OR: [
          ...(trackingId ? [{ trackingId }] : []),
          ...(consentHandle ? [{ consentHandle }] : []),
          ...(consentId ? [{ consentId }] : []),
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
      });
      return { success: true, message: 'Request not found, acknowledged.' };
    }

    const encryptedResponse = encryptPayload(payload);
    const now = new Date();

    let newStatus = request.status;
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
      failureReason = 'Customer rejected bank consent.';
      failedAt = now;
    } else if (['EXPIRED'].includes(rawConsentStatus)) {
      normalizedConsentStatus = 'EXPIRED';
      newStatus = 'EXPIRED';
      failureReason = 'Consent session expired.';
      failedAt = now;
    } else if (['REVOKED', 'PAUSED'].includes(rawConsentStatus)) {
      normalizedConsentStatus = 'REVOKED';
      newStatus = 'CANCELLED';
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
        consentedAt,
        failedAt,
        failureReason,
        providerResponseEncrypted: encryptedResponse,
      },
    });

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
      return { success: true, message: 'Request not found, acknowledged.' };
    }

    const encryptedResponse = encryptPayload(payload);
    const now = new Date();

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
  async fetchDataBySession(sessionId: string): Promise<any> {
    console.log(`[AA SERVICE] [CALL] fetchDataBySession - sessionId: ${sessionId}`);
    const startTime = Date.now();
    const cleanSessionId = String(sessionId || '').trim();

    if (!cleanSessionId) {
      throw new BadRequestException('Session ID is required.');
    }

    const request = await this.prisma.customerAccountAggregatorRequest.findFirst({
      where: { sessionId: cleanSessionId },
      orderBy: { id: 'desc' },
    });

    if (!request) {
      throw new NotFoundException(`AA request for session ID ${cleanSessionId} was not found.`);
    }

    // Idempotency: Return early if already SUCCESS
    if (request.status === 'SUCCESS') {
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

    // Encrypt raw provider response at rest
    const encryptedRawResponse = encryptPayload(fetchResponse);

    // Robust account data array normalization
    let rawAccounts: any = fetchResponse;
    if (rawAccounts && typeof rawAccounts === 'object' && 'data' in rawAccounts && rawAccounts.data !== null) {
      rawAccounts = rawAccounts.data;
    }

    let accountsData: any[] = [];
    if (Array.isArray(rawAccounts)) {
      accountsData = rawAccounts;
    } else if (rawAccounts && typeof rawAccounts === 'object') {
      if (Array.isArray(rawAccounts.accounts)) {
        accountsData = rawAccounts.accounts;
      } else if (Array.isArray(rawAccounts.account)) {
        accountsData = rawAccounts.account;
      } else if (Array.isArray(rawAccounts.Accounts)) {
        accountsData = rawAccounts.Accounts;
      } else if (Array.isArray(rawAccounts.Account)) {
        accountsData = rawAccounts.Account;
      } else if (Array.isArray(rawAccounts.data)) {
        accountsData = rawAccounts.data;
      } else if (rawAccounts.FIStatusResponse?.Accounts && Array.isArray(rawAccounts.FIStatusResponse.Accounts)) {
        accountsData = rawAccounts.FIStatusResponse.Accounts;
      } else if (rawAccounts.fipId || rawAccounts.maskedAccNo || rawAccounts.accNumber || rawAccounts.summary || rawAccounts.transactions) {
        // Single account object
        accountsData = [rawAccounts];
      } else {
        // Fallback to object values if it's a map of accounts
        accountsData = Object.values(rawAccounts).filter((item: any) => item && typeof item === 'object');
      }
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx: any) => {
      for (const acc of accountsData) {
        const accountHolderName = acc.accountHolderName || null;
        const accountType = acc.accountType || 'SAVINGS';
        const accountNumberMasked = acc.maskedAccNo || acc.accNumber || null;
        const accountNumberEncrypted = acc.accNumber ? encryptPayload(acc.accNumber) : null;
        const ifscCode = acc.ifscCode || null;
        const branchName = acc.branch || null;
        const fipId = acc.fipId || null;
        const fipName = acc.fipName || null;

        const summary = acc.summary || {};
        const currentBalance = summary.currentBalance != null ? Number(summary.currentBalance) : null;
        const availableBalance = summary.availableBalance != null ? Number(summary.availableBalance) : null;
        const currency = summary.currency || 'INR';

        const bankDataRecord = await tx.customerBankAccountData.create({
          data: {
            requestId: request.id,
            customerId: request.customerId,
            applicationId: request.applicationId,
            lan: request.lan,
            provider: 'UNAPORT',
            sessionId: cleanSessionId,
            fipId,
            fipName,
            accountType,
            accountNumberMasked,
            accountNumberEncrypted,
            accountHolderName,
            ifscCode,
            branchName,
            currency,
            currentBalance,
            availableBalance,
            summaryDate: summary.balanceDateTime ? new Date(summary.balanceDateTime) : now,
          },
        });

        // Normalize transactions safely
        let txnsList: any[] = [];
        const rawTxns = acc.transactions || acc.Transaction || acc.Transactions || acc.transaction;
        if (Array.isArray(rawTxns)) {
          txnsList = rawTxns;
        } else if (rawTxns && typeof rawTxns === 'object') {
          if (Array.isArray(rawTxns.transaction)) {
            txnsList = rawTxns.transaction;
          } else if (Array.isArray(rawTxns.Transaction)) {
            txnsList = rawTxns.Transaction;
          } else if (Array.isArray(rawTxns.transactions)) {
            txnsList = rawTxns.transactions;
          } else {
            txnsList = [rawTxns];
          }
        }

        for (const txn of txnsList) {
          const txnId = txn.txnId || null;
          const rawType = String(txn.type || 'DEBIT').toUpperCase();
          const txnType = rawType.includes('CREDIT') ? 'CREDIT' : 'DEBIT';
          const amount = Number(txn.amount || 0);
          const balance = txn.currentBalance != null ? Number(txn.currentBalance) : (txn.balance != null ? Number(txn.balance) : null);
          const narration = txn.narration || null;
          const mode = txn.mode || null;
          const referenceNumber = txn.reference || null;
          const txnDate = txn.transactionTimestamp ? new Date(txn.transactionTimestamp) : (txn.txnDate ? new Date(txn.txnDate) : now);
          const valueDate = txn.valueDate ? new Date(txn.valueDate) : null;

          // Stable hash for transaction deduplication
          const hashString = `${accountNumberMasked || ''}|${txnDate.toISOString()}|${amount}|${narration || ''}|${referenceNumber || ''}`;
          const transactionHash = createHash('sha256').update(hashString).digest('hex');

          // Idempotent upsert by (bankDataId, transactionHash)
          await tx.customerBankTransaction.upsert({
            where: {
              bankDataId_transactionHash: {
                bankDataId: bankDataRecord.id,
                transactionHash,
              },
            },
            create: {
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
            },
            update: {
              txnId,
              balance,
              narration,
            },
          });
        }
      }

      // Mark request as SUCCESS
      await tx.customerAccountAggregatorRequest.update({
        where: { id: request.id },
        data: {
          status: 'SUCCESS',
          dataStatus: 'COMPLETED',
          completedAt: now,
          providerResponseEncrypted: encryptedRawResponse,
        },
      });
    });

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

    const fetchResult = {
      success: true,
      message: 'Bank statement data fetched and stored successfully.',
    };
    console.log(`[AA SERVICE] [RESPONSE] fetchDataBySession - result:`, JSON.stringify(fetchResult, null, 2));
    return fetchResult;
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
