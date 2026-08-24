import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  IvrCallType,
  IvrCustomerContext,
  IvrTriggerSource,
  PipecatCallStatusResponse,
  PipecatNewCallResponse,
  TriggerCallParams,
} from './ivr.types';

@Injectable()
export class IvrService {
  private readonly logger = new Logger(IvrService.name);
  private readonly httpClient: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const baseURL =
      this.configService.get<string>('IVR_API_BASE_URL') ||
      'https://pipecat-api.kube.aguken.com';
    const timeout =
      this.configService.get<number>('IVR_REQUEST_TIMEOUT') || 30000;

    this.httpClient = axios.create({
      baseURL: baseURL.replace(/\/+$/, ''),
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Normalizes mobile number to E.164 format (+91XXXXXXXXXX for Indian numbers).
   */
  normalizePhoneNumber(mobile: string | null | undefined): string {
    if (!mobile) {
      throw new BadRequestException('Customer mobile number is missing.');
    }

    const cleaned = String(mobile).trim().replace(/[^\d+]/g, '');

    // Already in E.164 format with +91
    if (/^\+91[6-9]\d{9}$/.test(cleaned)) {
      return cleaned;
    }

    // 10-digit Indian mobile number
    if (/^[6-9]\d{9}$/.test(cleaned)) {
      return `+91${cleaned}`;
    }

    // 11-digit starting with 0
    if (/^0[6-9]\d{9}$/.test(cleaned)) {
      return `+91${cleaned.substring(1)}`;
    }

    // 12-digit starting with 91
    if (/^91[6-9]\d{9}$/.test(cleaned)) {
      return `+${cleaned}`;
    }

    // Other valid international E.164 formats
    if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
      return cleaned;
    }

    throw new BadRequestException(
      `Invalid mobile number format: '${mobile}'. A valid 10-digit mobile number is required.`,
    );
  }

  /**
   * Masks a bank account number securely, e.g. "1234567890" -> "XXXXXX7890"
   */
  maskAccountNumber(accountNumber: string | null | undefined): string | null {
    if (!accountNumber) return null;
    const clean = String(accountNumber).trim();
    if (clean.length <= 4) return `XXXX${clean}`;
    return `XXXXXX${clean.slice(-4)}`;
  }

  /**
   * Helper to map stored customer language to IVR language locale (e.g. "English" -> "en-IN", "Hindi" -> "hi-IN").
   */
  mapLanguage(kfsLanguage: string | null | undefined): string {
    const raw = String(kfsLanguage || '').trim().toLowerCase();
    if (raw.includes('hindi') || raw === 'hi' || raw === 'hi-in') return 'hi-IN';
    if (raw.includes('english') || raw === 'en' || raw === 'en-in') return 'en-IN';
    if (raw.includes('marathi') || raw === 'mr') return 'mr-IN';
    if (raw.includes('tamil') || raw === 'ta') return 'ta-IN';
    if (raw.includes('telugu') || raw === 'te') return 'te-IN';
    if (raw.includes('bengali') || raw === 'bn') return 'bn-IN';
    if (raw.includes('gujarati') || raw === 'gu') return 'gu-IN';
    return this.configService.get<string>('IVR_DEFAULT_LANGUAGE') || 'en-IN';
  }

  /**
   * Dynamic IVR Context Builder
   * Gathers all available customer, application, loan, repayment, and link data dynamically from DB.
   * Tailors payload according to the call touchpoint.
   */
  buildIvrCustomerContext(
    customer: any,
    application?: any,
    loan?: any,
    callType: IvrCallType = IvrCallType.APPLICATION_FOLLOW_UP,
  ): IvrCustomerContext {
    const frontendBaseUrl = (this.configService.get<string>('FRONTEND_URL') || 'https://finle-prod.fintreelms.com').replace(/\/+$/, '');
    const normalizedMobile = this.normalizePhoneNumber(customer?.mobileNumber);

    // 1. Identification
    const eventId = `EVT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const touchPointCode = String(callType);
    const customerId = customer?.customerCode || (customer?.id ? `CUST-${customer.id}` : null);
    const appId = application?.applicationNumber || (application?.id ? `APP-${application.id}` : null);
    const lan = loan?.lan || application?.platformLan || null;
    const customerName = (customer?.fullName || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim()) || 'Customer';
    const language = this.mapLanguage(customer?.kfsLanguage);

    // 2. Bank Information
    const latestBankData = customer?.bankData?.[0] || customer?.bankData;
    const bankName = loan?.bankName || loan?.bankVerification?.bankName || latestBankData?.fipName || null;
    const rawAccount = loan?.bankAccountMasked || loan?.bankVerification?.accountNumber || latestBankData?.accountNumberMasked || latestBankData?.accountNumberEncrypted;
    const accountMasked = loan?.bankAccountMasked || this.maskAccountNumber(rawAccount);

    // 3. Financials & Repayment
    const nextPendingRps = loan?.repaymentSchedules?.[0];
    const dueDate = nextPendingRps?.dueDate
      ? new Date(nextPendingRps.dueDate).toISOString().split('T')[0]
      : (loan?.nextEmiDate ? new Date(loan.nextEmiDate).toISOString().split('T')[0] : null);

    const approvedAmount = loan?.approvedAmount
      ? Number(loan.approvedAmount)
      : (application?.approvedAmount
        ? Number(application.approvedAmount)
        : (application?.lenderApprovedAmount ? Number(application.lenderApprovedAmount) : null));

    const maxTenureDays = loan?.acceptedTenureDays
      || (application?.selectedTenure ? application.selectedTenure : null)
      || (application?.lenderApprovedTenure ? application.lenderApprovedTenure : null)
      || (application?.requestedTenure ? application.requestedTenure : null);

    const emiAmount = nextPendingRps?.emi
      ? Number(nextPendingRps.emi)
      : (loan?.acceptedEmiAmount ? Number(loan.acceptedEmiAmount) : (loan?.emiAmount ? Number(loan.emiAmount) : null));

    const totalRepayment = loan?.acceptedTotalRepayment
      ? Number(loan.acceptedTotalRepayment)
      : (approvedAmount && emiAmount && maxTenureDays ? Number(emiAmount) * (maxTenureDays > 30 ? Math.round(maxTenureDays / 30) : maxTenureDays) : null);

    // 4. Disbursal Information
    const disbursalAmount = loan?.disbursalAmount
      ? Number(loan.disbursalAmount)
      : approvedAmount;

    const isDisbursed = loan?.status === 'DISBURSED' || !!loan?.disbursalCompletedAt;
    const disbursedAmount = isDisbursed ? (loan?.disbursalAmount ? Number(loan.disbursalAmount) : approvedAmount) : null;
    const disbursalUtr = isDisbursed ? (loan?.disbursalUtr || null) : null;

    // 5. Links
    const applicationLink = appId ? `${frontendBaseUrl}/apply/${appId}` : `${frontendBaseUrl}/customer/application`;
    const latestMandate = loan?.mandates?.[0];
    const mandateLink = latestMandate?.portalUrl || `${frontendBaseUrl}/customer/mandate`;
    const eSignLink = `${frontendBaseUrl}/customer/esign`;
    const latestPaymentLink = application?.paymentLinks?.[0];
    const paymentLink = latestPaymentLink?.paymentLink || `${frontendBaseUrl}/customer/pay`;

    // 6. Repeat Loan Offer Information (TP-06)
    const isFullyPaid = loan?.status === 'FULLY_PAID';
    const loanStatusString = isFullyPaid ? 'Fully Paid' : (isDisbursed ? 'Disbursed' : 'Active');
    const previousLoanAmount = loan?.approvedAmount
      ? Number(loan.approvedAmount)
      : (application?.approvedAmount ? Number(application.approvedAmount) : null);

    const configuredRepeatAmount = this.configService.get<number>('IVR_REPEAT_LOAN_DEFAULT_AMOUNT');
    const repeatLoanEligibleAmount = configuredRepeatAmount
      || (previousLoanAmount ? Math.max(12000, Math.round(previousLoanAmount * 1.5)) : 12000);

    const repeatLoanLink = `${frontendBaseUrl}/apply?repeat=true`;

    // Master context
    const fullContext: IvrCustomerContext = {
      EVENT_ID: eventId,
      TOUCH_POINT_CODE: touchPointCode,
      CUSTOMER_ID: customerId,
      APP_ID: appId,
      TRIGGERED_AT: new Date().toISOString(),
      CUSTOMER_NAME: customerName,
      CUSTOMER_MOBILE: normalizedMobile,
      TO: normalizedMobile,
      LAN: lan,
      LANGUAGE: language,
      BANK_NAME: bankName,
      ACCOUNT_MASKED: accountMasked,
      DUE_DATE: dueDate,
      APPROVED_AMOUNT: approvedAmount,
      MAX_TENURE_DAYS: maxTenureDays,
      TOTAL_REPAYMENT: totalRepayment,
      DISBURSAL_AMOUNT: disbursalAmount,
      DISBURSED_AMOUNT: disbursedAmount,
      DISBURSAL_UTR: disbursalUtr,
      TOTAL_BULLET_REPAYMENT: null,
      BULLET_EMI_AMOUNT: null,
      APPLICATION_LINK: applicationLink,
      MANDATE_LINK: mandateLink,
      E_SIGN_LINK: eSignLink,
      PAYMENT_LINK: paymentLink,
      LOAN_STATUS: loanStatusString,
      PREVIOUS_LOAN_AMOUNT: previousLoanAmount,
      REPEAT_LOAN_ELIGIBLE_AMOUNT: repeatLoanEligibleAmount,
      REPEAT_LOAN_LINK: repeatLoanLink,
    };

    // Call-Type Specific Data Tailoring
    let tailoredContext: Record<string, any> = {};

    switch (callType) {
      case IvrCallType.APPLICATION_FOLLOW_UP:
        tailoredContext = {
          EVENT_ID: fullContext.EVENT_ID,
          TOUCH_POINT_CODE: fullContext.TOUCH_POINT_CODE,
          CUSTOMER_ID: fullContext.CUSTOMER_ID,
          APP_ID: fullContext.APP_ID,
          TRIGGERED_AT: fullContext.TRIGGERED_AT,
          CUSTOMER_NAME: fullContext.CUSTOMER_NAME,
          CUSTOMER_MOBILE: fullContext.CUSTOMER_MOBILE,
          TO: fullContext.TO,
          LANGUAGE: fullContext.LANGUAGE,
          APPLICATION_LINK: fullContext.APPLICATION_LINK,
          APPROVED_AMOUNT: fullContext.APPROVED_AMOUNT,
          MAX_TENURE_DAYS: fullContext.MAX_TENURE_DAYS,
        };
        break;

      case IvrCallType.KYC_PENDING:
      case IvrCallType.DOCUMENT_PENDING:
        tailoredContext = {
          EVENT_ID: fullContext.EVENT_ID,
          TOUCH_POINT_CODE: fullContext.TOUCH_POINT_CODE,
          CUSTOMER_ID: fullContext.CUSTOMER_ID,
          APP_ID: fullContext.APP_ID,
          TRIGGERED_AT: fullContext.TRIGGERED_AT,
          CUSTOMER_NAME: fullContext.CUSTOMER_NAME,
          CUSTOMER_MOBILE: fullContext.CUSTOMER_MOBILE,
          TO: fullContext.TO,
          LANGUAGE: fullContext.LANGUAGE,
          LAN: fullContext.LAN,
          APPLICATION_LINK: fullContext.APPLICATION_LINK,
        };
        break;

      case IvrCallType.MANDATE_PENDING:
        tailoredContext = {
          EVENT_ID: fullContext.EVENT_ID,
          TOUCH_POINT_CODE: fullContext.TOUCH_POINT_CODE,
          CUSTOMER_ID: fullContext.CUSTOMER_ID,
          APP_ID: fullContext.APP_ID,
          TRIGGERED_AT: fullContext.TRIGGERED_AT,
          CUSTOMER_NAME: fullContext.CUSTOMER_NAME,
          CUSTOMER_MOBILE: fullContext.CUSTOMER_MOBILE,
          TO: fullContext.TO,
          LANGUAGE: fullContext.LANGUAGE,
          LAN: fullContext.LAN,
          APPROVED_AMOUNT: fullContext.APPROVED_AMOUNT,
          MANDATE_LINK: fullContext.MANDATE_LINK,
          BANK_NAME: fullContext.BANK_NAME,
          ACCOUNT_MASKED: fullContext.ACCOUNT_MASKED,
        };
        break;

      case IvrCallType.ESIGN_PENDING:
        tailoredContext = {
          EVENT_ID: fullContext.EVENT_ID,
          TOUCH_POINT_CODE: fullContext.TOUCH_POINT_CODE,
          CUSTOMER_ID: fullContext.CUSTOMER_ID,
          APP_ID: fullContext.APP_ID,
          TRIGGERED_AT: fullContext.TRIGGERED_AT,
          CUSTOMER_NAME: fullContext.CUSTOMER_NAME,
          CUSTOMER_MOBILE: fullContext.CUSTOMER_MOBILE,
          TO: fullContext.TO,
          LANGUAGE: fullContext.LANGUAGE,
          LAN: fullContext.LAN,
          APPROVED_AMOUNT: fullContext.APPROVED_AMOUNT,
          E_SIGN_LINK: fullContext.E_SIGN_LINK,
        };
        break;

      case IvrCallType.LOAN_APPROVAL:
        tailoredContext = {
          EVENT_ID: fullContext.EVENT_ID,
          TOUCH_POINT_CODE: fullContext.TOUCH_POINT_CODE,
          CUSTOMER_ID: fullContext.CUSTOMER_ID,
          APP_ID: fullContext.APP_ID,
          TRIGGERED_AT: fullContext.TRIGGERED_AT,
          CUSTOMER_NAME: fullContext.CUSTOMER_NAME,
          CUSTOMER_MOBILE: fullContext.CUSTOMER_MOBILE,
          TO: fullContext.TO,
          LANGUAGE: fullContext.LANGUAGE,
          LAN: fullContext.LAN,
          APPROVED_AMOUNT: fullContext.APPROVED_AMOUNT,
          MAX_TENURE_DAYS: fullContext.MAX_TENURE_DAYS,
          TOTAL_REPAYMENT: fullContext.TOTAL_REPAYMENT,
          APPLICATION_LINK: fullContext.APPLICATION_LINK,
        };
        break;

      case IvrCallType.DISBURSEMENT:
      case IvrCallType.DISBURSEMENT_CONFIRMATION:
        tailoredContext = {
          EVENT_ID: fullContext.EVENT_ID,
          TOUCH_POINT_CODE: fullContext.TOUCH_POINT_CODE,
          CUSTOMER_ID: fullContext.CUSTOMER_ID,
          APP_ID: fullContext.APP_ID,
          TRIGGERED_AT: fullContext.TRIGGERED_AT,
          CUSTOMER_NAME: fullContext.CUSTOMER_NAME,
          CUSTOMER_MOBILE: fullContext.CUSTOMER_MOBILE,
          TO: fullContext.TO,
          LANGUAGE: fullContext.LANGUAGE,
          LAN: fullContext.LAN,
          DISBURSAL_AMOUNT: fullContext.DISBURSAL_AMOUNT,
          DISBURSED_AMOUNT: fullContext.DISBURSED_AMOUNT,
          DISBURSAL_UTR: fullContext.DISBURSAL_UTR,
          BANK_NAME: fullContext.BANK_NAME,
          ACCOUNT_MASKED: fullContext.ACCOUNT_MASKED,
        };
        break;

      case IvrCallType.EMI_REMINDER:
      case IvrCallType.PAYMENT_OVERDUE:
      case IvrCallType.PAYMENT_FOLLOW_UP:
      case IvrCallType.PAYMENT_CONFIRMATION:
        tailoredContext = {
          EVENT_ID: fullContext.EVENT_ID,
          TOUCH_POINT_CODE: fullContext.TOUCH_POINT_CODE,
          CUSTOMER_ID: fullContext.CUSTOMER_ID,
          APP_ID: fullContext.APP_ID,
          TRIGGERED_AT: fullContext.TRIGGERED_AT,
          CUSTOMER_NAME: fullContext.CUSTOMER_NAME,
          CUSTOMER_MOBILE: fullContext.CUSTOMER_MOBILE,
          TO: fullContext.TO,
          LANGUAGE: fullContext.LANGUAGE,
          LAN: fullContext.LAN,
          DUE_DATE: fullContext.DUE_DATE,
          APPROVED_AMOUNT: fullContext.APPROVED_AMOUNT,
          TOTAL_REPAYMENT: fullContext.TOTAL_REPAYMENT,
          PAYMENT_LINK: fullContext.PAYMENT_LINK,
        };
        break;

      case IvrCallType.REPEAT_LOAN_OFFER:
        tailoredContext = {
          EVENT_ID: fullContext.EVENT_ID,
          TOUCH_POINT_CODE: 'REPEAT_LOAN_OFFER',
          CUSTOMER_ID: fullContext.CUSTOMER_ID,
          APP_ID: fullContext.APP_ID,
          TRIGGERED_AT: fullContext.TRIGGERED_AT,
          CUSTOMER_NAME: fullContext.CUSTOMER_NAME,
          CUSTOMER_MOBILE: fullContext.CUSTOMER_MOBILE,
          TO: fullContext.TO,
          LANGUAGE: fullContext.LANGUAGE,
          LAN: fullContext.LAN,
          LOAN_STATUS: 'Fully Paid',
          PREVIOUS_LOAN_AMOUNT: fullContext.PREVIOUS_LOAN_AMOUNT,
          REPEAT_LOAN_ELIGIBLE_AMOUNT: fullContext.REPEAT_LOAN_ELIGIBLE_AMOUNT,
          REPEAT_LOAN_LINK: fullContext.REPEAT_LOAN_LINK,
        };
        break;

      case IvrCallType.GENERIC:
      case IvrCallType.CUSTOMER_SUPPORT:
      default:
        tailoredContext = { ...fullContext };
        break;
    }

    // Clean null / undefined values
    Object.keys(tailoredContext).forEach((k) => {
      if (tailoredContext[k] === undefined) {
        delete tailoredContext[k];
      }
    });

    return tailoredContext as IvrCustomerContext;
  }

  /**
   * Initiates an outbound AI call via Pipecat API.
   */
  async makeCall(params: TriggerCallParams): Promise<{
    success: boolean;
    message: string;
    callId: string;
    logId?: string;
  }> {
    const startTime = Date.now();
    const {
      customerId,
      applicationId,
      lan,
      callType = IvrCallType.APPLICATION_FOLLOW_UP,
      triggerSource = IvrTriggerSource.ADMIN,
      triggeredById,
    } = params;

    let customer: any = null;
    let application: any = null;
    let loan: any = null;

    if (applicationId) {
      application = await this.prisma.plApplication.findUnique({
        where: { id: BigInt(applicationId) },
        include: {
          customer: true,
          loans: {
            take: 1,
            orderBy: { id: 'desc' },
            include: {
              repaymentSchedules: {
                where: { paymentStatus: 'PENDING' },
                orderBy: { installmentNumber: 'asc' },
                take: 1,
              },
              bankVerification: true,
              mandates: { take: 1, orderBy: { id: 'desc' } },
            },
          },
          paymentLinks: {
            take: 1,
            orderBy: { id: 'desc' },
          },
        },
      });
      if (!application) {
        throw new NotFoundException(`Loan application #${applicationId} not found.`);
      }
      customer = application.customer;
      loan = application.loans?.[0] || null;
    } else if (lan) {
      loan = await this.prisma.plLoan.findUnique({
        where: { lan: String(lan).trim() },
        include: {
          customer: true,
          application: {
            include: {
              paymentLinks: { take: 1, orderBy: { id: 'desc' } },
            },
          },
          repaymentSchedules: {
            where: { paymentStatus: 'PENDING' },
            orderBy: { installmentNumber: 'asc' },
            take: 1,
          },
          bankVerification: true,
          mandates: { take: 1, orderBy: { id: 'desc' } },
        },
      });
      if (loan) {
        customer = loan.customer;
        application = loan.application;
      } else {
        application = await this.prisma.plApplication.findFirst({
          where: { platformLan: String(lan).trim() },
          include: {
            customer: true,
            loans: {
              take: 1,
              orderBy: { id: 'desc' },
              include: {
                repaymentSchedules: {
                  where: { paymentStatus: 'PENDING' },
                  orderBy: { installmentNumber: 'asc' },
                  take: 1,
                },
                bankVerification: true,
                mandates: { take: 1, orderBy: { id: 'desc' } },
              },
            },
            paymentLinks: { take: 1, orderBy: { id: 'desc' } },
          },
        });
        if (!application) {
          throw new NotFoundException(`Record with LAN '${lan}' not found.`);
        }
        customer = application.customer;
        loan = application.loans?.[0] || null;
      }
    } else if (customerId) {
      customer = await this.prisma.customer.findUnique({
        where: { id: BigInt(customerId) },
        include: {
          applications: {
            take: 1,
            orderBy: { id: 'desc' },
            include: {
              paymentLinks: { take: 1, orderBy: { id: 'desc' } },
            },
          },
          loans: {
            take: 1,
            orderBy: { id: 'desc' },
            include: {
              repaymentSchedules: {
                where: { paymentStatus: 'PENDING' },
                orderBy: { installmentNumber: 'asc' },
                take: 1,
              },
              bankVerification: true,
              mandates: { take: 1, orderBy: { id: 'desc' } },
            },
          },
        },
      });
      if (!customer) {
        throw new NotFoundException(`Customer #${customerId} not found.`);
      }
      application = customer.applications?.[0] || null;
      loan = customer.loans?.[0] || null;
    } else {
      throw new BadRequestException('At least one of customerId, applicationId, or lan must be provided.');
    }

    if (!customer) {
      throw new NotFoundException('Customer record could not be located.');
    }

    const customData = this.buildIvrCustomerContext(customer, application, loan, callType);
    const normalizedMobile = customData.TO;
    const agentId = this.configService.get<string>('IVR_AGENT_ID') || '';
    const clientId = this.configService.get<string>('IVR_CLIENT_ID') || '';

    const effectiveAgentId = agentId || clientId;

    if (!effectiveAgentId) {
      throw new BadRequestException(
        'IVR_AGENT_ID / IVR_CLIENT_ID is not configured in backend .env. Please provide your Pipecat Agent/Client ID to initiate calls.',
      );
    }

    const payload: Record<string, any> = {
      to: normalizedMobile,
      agentId: effectiveAgentId,
      ...(clientId ? { clientId } : {}),
      customData,
    };

    this.logger.log({
      event: 'ivr_call_initiate_request',
      customerId: customData.CUSTOMER_ID,
      applicationId: customData.APP_ID,
      lan: customData.LAN,
      mobile: normalizedMobile,
      agentId: effectiveAgentId,
      clientId: clientId || undefined,
      callType,
      triggerSource,
      customData,
    });

    let providerCallId: string;
    let providerRawResponse: any = null;

    try {
      const response = await this.httpClient.post<any>(
        '/calls/new',
        payload,
      );

      providerRawResponse = response.data;
      providerCallId =
        providerRawResponse?.response?.callId ||
        providerRawResponse?.callId ||
        providerRawResponse?.dbCall?.id ||
        providerRawResponse?.dbCall?._id ||
        providerRawResponse?.id ||
        providerRawResponse?.twilioCall?.sid;

      if (!providerCallId) {
        throw new Error(
          providerRawResponse?.message ||
            providerRawResponse?.error ||
            'Provider did not return a callId.',
        );
      }
    } catch (err: any) {
      const rawData = err?.response?.data;
      const errorDetail =
        typeof rawData === 'string'
          ? rawData
          : rawData?.message || rawData?.error || rawData?.details || (rawData ? JSON.stringify(rawData) : null);
      const errorMsg = errorDetail || err?.message || 'Unable to initiate IVR call at this time.';

      this.logger.error({
        event: 'ivr_call_provider_failure',
        error: errorMsg,
        status: err?.response?.status,
        providerResponse: rawData,
        durationMs: Date.now() - startTime,
      });

      throw new InternalServerErrorException(
        `Unable to initiate IVR call: ${errorMsg}`,
      );
    }

    // Save call record to database
    const now = new Date();

    try {
      const targetLan = loan?.lan || application?.platformLan || null;
      const targetCustId = customer?.id ? BigInt(customer.id) : null;
      const targetAppId = application?.id ? BigInt(application.id) : null;

      await this.prisma.$executeRaw`
        INSERT INTO ivr_call_logs (
          customer_id, application_id, lan, customer_mobile, provider_call_id,
          agent_id, call_type, trigger_source, triggered_by_id, status,
          custom_data, provider_response, created_at, updated_at
        ) VALUES (
          ${targetCustId}, ${targetAppId}, ${targetLan}, ${normalizedMobile}, ${providerCallId},
          ${agentId}, ${callType}, ${triggerSource}, ${triggeredById || null}, 'INITIATED',
          ${JSON.stringify(customData)}, ${JSON.stringify(providerRawResponse)}, ${now}, ${now}
        )
      `;

      this.logger.log({
        event: 'ivr_call_logged_successfully',
        providerCallId,
        durationMs: Date.now() - startTime,
      });
    } catch (dbErr: any) {
      this.logger.warn({
        event: 'ivr_call_db_log_warning',
        error: dbErr?.message,
        providerCallId,
      });
    }

    return {
      success: true,
      message: 'IVR call initiated successfully.',
      callId: providerCallId,
    };
  }

  /**
   * Fetches latest call status from Pipecat API and syncs with the database log.
   */
  async getCallStatus(callId: string): Promise<{
    success: boolean;
    callId: string;
    status: string;
    duration?: number | null;
    callSummary?: any;
    transcript?: string | null;
    recordingLink?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    raw?: any;
  }> {
    const cleanCallId = String(callId || '').trim();
    if (!cleanCallId) {
      throw new BadRequestException('Call ID is required.');
    }

    let providerData: PipecatCallStatusResponse;

    try {
      const response = await this.httpClient.get<PipecatCallStatusResponse>(
        `/calls/status/${cleanCallId}`,
      );
      providerData = response.data?.response || response.data;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        throw new NotFoundException(`Call status for ID '${cleanCallId}' was not found.`);
      }
      const errorMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Unable to retrieve IVR call status.';
      this.logger.error({
        event: 'ivr_call_status_fetch_error',
        callId: cleanCallId,
        error: errorMsg,
      });
      throw new InternalServerErrorException(errorMsg);
    }

    const currentStatus = String(providerData?.status || 'UNKNOWN').toUpperCase();
    const duration = providerData?.duration != null ? Number(providerData.duration) : null;
    const callSummary =
      typeof providerData?.callSummary === 'string'
        ? providerData.callSummary
        : providerData?.callSummary
        ? JSON.stringify(providerData.callSummary)
        : null;
    const transcript = providerData?.transcript || null;
    const recordingLink = providerData?.recordingLink || null;
    const startTimeDate = providerData?.startTime ? new Date(providerData.startTime) : null;
    const endTimeDate = providerData?.endTime ? new Date(providerData.endTime) : null;

    // Update database log
    try {
      await this.prisma.$executeRaw`
        UPDATE ivr_call_logs
        SET
          status = ${currentStatus},
          duration = ${duration},
          call_summary = ${callSummary},
          transcript = ${transcript},
          recording_link = ${recordingLink},
          start_time = ${startTimeDate},
          end_time = ${endTimeDate},
          provider_response = ${JSON.stringify(providerData)},
          updated_at = NOW()
        WHERE provider_call_id = ${cleanCallId}
      `;
    } catch (dbErr: any) {
      this.logger.warn({
        event: 'ivr_call_status_db_update_warning',
        callId: cleanCallId,
        error: dbErr?.message,
      });
    }

    return {
      success: true,
      callId: cleanCallId,
      status: currentStatus,
      duration,
      callSummary: providerData?.callSummary || null,
      transcript,
      recordingLink,
      startTime: providerData?.startTime ? String(providerData.startTime) : null,
      endTime: providerData?.endTime ? String(providerData.endTime) : null,
      raw: providerData,
    };
  }

  /**
   * Retrieves call history for an application or customer.
   */
  async getCallHistory(filter: {
    applicationId?: bigint | number;
    lan?: string;
    customerId?: bigint | number;
  }): Promise<any[]> {
    const { applicationId, lan, customerId } = filter;

    let rows: any[] = [];
    try {
      if (applicationId) {
        rows = await this.prisma.$queryRaw`
          SELECT
            id, customer_id as customerId, application_id as applicationId, lan,
            customer_mobile as customerMobile, provider_call_id as providerCallId,
            agent_id as agentId, call_type as callType, trigger_source as triggerSource,
            triggered_by_id as triggeredById, status, duration, start_time as startTime,
            end_time as endTime, call_summary as callSummary, transcript, recording_link as recordingLink,
            created_at as createdAt, updated_at as updatedAt
          FROM ivr_call_logs
          WHERE application_id = ${BigInt(applicationId)}
          ORDER BY id DESC
          LIMIT 50
        `;
      } else if (lan) {
        rows = await this.prisma.$queryRaw`
          SELECT
            id, customer_id as customerId, application_id as applicationId, lan,
            customer_mobile as customerMobile, provider_call_id as providerCallId,
            agent_id as agentId, call_type as callType, trigger_source as triggerSource,
            triggered_by_id as triggeredById, status, duration, start_time as startTime,
            end_time as endTime, call_summary as callSummary, transcript, recording_link as recordingLink,
            created_at as createdAt, updated_at as updatedAt
          FROM ivr_call_logs
          WHERE lan = ${String(lan).trim()}
          ORDER BY id DESC
          LIMIT 50
        `;
      } else if (customerId) {
        rows = await this.prisma.$queryRaw`
          SELECT
            id, customer_id as customerId, application_id as applicationId, lan,
            customer_mobile as customerMobile, provider_call_id as providerCallId,
            agent_id as agentId, call_type as callType, trigger_source as triggerSource,
            triggered_by_id as triggeredById, status, duration, start_time as startTime,
            end_time as endTime, call_summary as callSummary, transcript, recording_link as recordingLink,
          WHERE customer_id = ${BigInt(customerId)}
          ORDER BY id DESC
          LIMIT 50
        `;
      }
    } catch (err: any) {
      this.logger.error('Failed to query ivr_call_logs', err?.stack);
      return [];
    }

    return rows.map((r) => ({
      ...r,
      id: r.id ? r.id.toString() : undefined,
      customerId: r.customerId ? r.customerId.toString() : undefined,
      applicationId: r.applicationId ? r.applicationId.toString() : undefined,
    }));
  }

  /**
   * Processes incoming IVR Webhooks (Call Lifecycle Events & Analytics Events).
   */
  async handleWebhook(payload: any, eventGroup: string = 'general'): Promise<{ success: boolean; message: string }> {
    this.logger.log({
      event: 'ivr_webhook_received',
      eventGroup,
      payload,
    });

    if (!payload || typeof payload !== 'object') {
      return { success: true, message: 'Empty payload received' };
    }

    const callId = payload.call_id || payload.callId || payload.id;
    if (!callId) {
      this.logger.warn({
        event: 'ivr_webhook_missing_call_id',
        payload,
      });
      return { success: true, message: 'call_id missing from webhook payload' };
    }

    const rawStatus = String(payload.status || '').trim().toLowerCase();
    let normalizedStatus = rawStatus.toUpperCase();

    if (rawStatus === 'in-progress' || rawStatus === 'in_progress') normalizedStatus = 'IN_PROGRESS';
    else if (rawStatus === 'no-answer' || rawStatus === 'no_answer') normalizedStatus = 'NO_ANSWER';
    else if (rawStatus === 'started') normalizedStatus = 'STARTED';
    else if (rawStatus === 'completed') normalizedStatus = 'COMPLETED';
    else if (rawStatus === 'analytics_completed') normalizedStatus = 'COMPLETED';
    else if (rawStatus === 'busy') normalizedStatus = 'BUSY';
    else if (rawStatus === 'failed') normalizedStatus = 'FAILED';
    else if (rawStatus === 'ringing') normalizedStatus = 'RINGING';

    const transcript = payload.transcript || null;
    const recordingLink = payload.recording_link || payload.recordingLink || null;
    const callSummary = payload.call_summary
      ? (typeof payload.call_summary === 'string' ? payload.call_summary : JSON.stringify(payload.call_summary))
      : null;

    const duration = payload.duration != null ? Number(payload.duration) : null;

    try {
      if (rawStatus === 'started') {
        await this.prisma.$executeRaw`
          UPDATE ivr_call_logs
          SET
            status = 'STARTED',
            start_time = COALESCE(start_time, NOW()),
            provider_response = ${JSON.stringify(payload)},
            updated_at = NOW()
          WHERE provider_call_id = ${String(callId)}
        `;
      } else if (rawStatus === 'completed') {
        await this.prisma.$executeRaw`
          UPDATE ivr_call_logs
          SET
            status = 'COMPLETED',
            transcript = COALESCE(${transcript}, transcript),
            recording_link = COALESCE(${recordingLink}, recording_link),
            end_time = COALESCE(end_time, NOW()),
            provider_response = ${JSON.stringify(payload)},
            updated_at = NOW()
          WHERE provider_call_id = ${String(callId)}
        `;
      } else if (rawStatus === 'analytics_completed') {
        await this.prisma.$executeRaw`
          UPDATE ivr_call_logs
          SET
            status = 'COMPLETED',
            call_summary = COALESCE(${callSummary}, call_summary),
            provider_response = ${JSON.stringify(payload)},
            updated_at = NOW()
          WHERE provider_call_id = ${String(callId)}
        `;
      } else {
        await this.prisma.$executeRaw`
          UPDATE ivr_call_logs
          SET
            status = ${normalizedStatus},
            duration = COALESCE(${duration}, duration),
            provider_response = ${JSON.stringify(payload)},
            updated_at = NOW()
          WHERE provider_call_id = ${String(callId)}
        `;
      }

      this.logger.log({
        event: 'ivr_webhook_processed_successfully',
        callId,
        status: normalizedStatus,
      });
    } catch (err: any) {
      this.logger.error({
        event: 'ivr_webhook_db_update_error',
        callId,
        error: err?.message,
      });
    }

    return { success: true, message: 'Webhook processed' };
  }
}

