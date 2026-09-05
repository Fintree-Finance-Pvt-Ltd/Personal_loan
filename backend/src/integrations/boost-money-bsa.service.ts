import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

export interface BsaAccountPayload {
  Transactions?: any[];
  Summary?: Record<string, any>;
  Profile?: Record<string, any>;
  [key: string]: any;
}

export interface BsaParseTransactionsInput {
  fipId: string;
  bankCode?: string;
  accounts: BsaAccountPayload[];
  customerId: bigint | number;
  applicationId?: bigint | number | null;
  lan: string;
  source?: 'AA' | 'BANK_STATEMENT';
}

export interface BsaStatementUploadItem {
  bank: string;
  accountType: string;
  bankStmt: {
    buffer: Buffer;
    originalname: string;
    mimetype?: string;
  };
  employerDetails?: string;
  password?: string;
  accNo?: string;
}

export interface BsaUploadStatementsInput {
  statements: BsaStatementUploadItem[];
  callbackUrl?: string;
  customerId: bigint | number;
  applicationId?: bigint | number | null;
  lan: string;
}

export interface BsaParseResponse {
  success: boolean;
  jobId?: string;
  status?: string;
  accountUID?: string;
  parseStatus?: string;
  parseMessage?: string;
  errors?: any;
  rawResponse?: any;
  analysisRecordId?: string;
}

export interface BsaFraudReportResult {
  success: boolean;
  accountUid: string;
  reportPath?: string;
  error?: string;
}

@Injectable()
export class BoostMoneyBsaService {
  private readonly logger = new Logger(BoostMoneyBsaService.name);
  private readonly httpClient: AxiosInstance;
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const timeout = Number(
      this.configService.get<string>('BSA_HTTP_TIMEOUT_MS') || '30000',
    );
    this.httpClient = axios.create({
      timeout: isNaN(timeout) ? 30000 : timeout,
    });
  }

  private getBaseUrl(): string {
    const baseUrl =
      this.configService.get<string>('BSA_API_BASE_URL') ||
      'https://bsa.boost.money';
    return baseUrl.replace(/\/+$/, '');
  }

  /**
   * Fetches or retrieves a valid access token.
   * If BSA_API_TOKEN is statically provided, uses it.
   * Otherwise logs in dynamically via POST /api/v1/client/login and caches token.
   */
  async getValidToken(forceRefresh = false): Promise<string> {
    const staticToken = (this.configService.get<string>('BSA_API_TOKEN') || '').trim();
    if (staticToken) {
      return staticToken;
    }

    const now = Date.now();
    if (!forceRefresh && this.cachedToken && this.tokenExpiresAt > now + 60000) {
      return this.cachedToken;
    }

    const clientId = (this.configService.get<string>('BSA_CLIENT_ID') || '').trim();
    const clientSecret = (this.configService.get<string>('BSA_CLIENT_SECRET') || '').trim();

    if (!clientId || !clientSecret) {
      throw new UnauthorizedException('BSA client credentials (BSA_CLIENT_ID / BSA_CLIENT_SECRET) or BSA_API_TOKEN not configured.');
    }

    const loginEndpoint = `${this.getBaseUrl()}/api/v1/client/login`;
    try {
      this.logger.log({
        event: 'bsa_client_login_initiated',
        clientId,
        endpoint: loginEndpoint,
      });

      const res = await this.httpClient.post(
        loginEndpoint,
        { clientId, clientSecret },
        { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
      );

      const resData = res.data;
      const accessToken =
        resData?.access_token ||
        resData?.accessToken ||
        resData?.data?.access_token ||
        resData?.data?.accessToken ||
        resData?.token;

      if (!accessToken) {
        throw new UnauthorizedException('No access_token received from Boost Money BSA login API.');
      }

      this.cachedToken = accessToken;

      // Extract expiry from JWT payload if available or default to 50 minutes
      try {
        const parts = accessToken.split('.');
        if (parts.length === 3) {
          const payloadJson = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payloadJson?.exp) {
            this.tokenExpiresAt = payloadJson.exp * 1000;
          } else {
            this.tokenExpiresAt = now + 50 * 60 * 1000;
          }
        } else {
          this.tokenExpiresAt = now + 50 * 60 * 1000;
        }
      } catch {
        this.tokenExpiresAt = now + 50 * 60 * 1000;
      }

      this.logger.log({
        event: 'bsa_client_login_success',
        clientId,
        expiresInSec: Math.round((this.tokenExpiresAt - now) / 1000),
      });

      return accessToken;
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'BSA login failed';
      this.logger.error({
        event: 'bsa_client_login_failed',
        clientId,
        error: errMsg,
      });
      throw new UnauthorizedException(`Failed to authenticate with Boost Money BSA API: ${errMsg}`);
    }
  }

  /**
   * Parse Raw Bank Transactions via Boost Money BSA API
   * POST /api/v1/parse/transactions
   */
  async parseTransactions(
    input: BsaParseTransactionsInput,
  ): Promise<BsaParseResponse> {
    const startTime = Date.now();

    this.logger.log({
      event: 'bsa_parse_transactions_initiated',
      lan: input.lan,
      customerId: String(input.customerId),
      fipId: input.fipId,
      accountsCount: input.accounts?.length || 0,
    });

    let token = '';
    try {
      token = await this.getValidToken();
    } catch (tokenErr: any) {
      this.logger.error({
        event: 'bsa_token_error',
        message: tokenErr?.message,
        lan: input.lan,
      });
      const failedRecord = await this.prisma.customerBankStatementAnalysis.create({
        data: {
          customerId: BigInt(input.customerId),
          applicationId: input.applicationId ? BigInt(input.applicationId) : null,
          lan: input.lan,
          source: input.source || 'BANK_STATEMENT',
          parseStatus: 'FAILED',
          failureReason: tokenErr?.message || 'BSA token generation failed.',
        },
      });
      return {
        success: false,
        status: 'FAILED',
        parseStatus: 'FAILED',
        parseMessage: tokenErr?.message || 'BSA token generation failed.',
        errors: tokenErr?.message,
        analysisRecordId: failedRecord.id.toString(),
      };
    }

    const payload = {
      fipId: input.fipId,
      bankCode: input.bankCode || input.fipId,
      accounts: input.accounts,
    };

    const endpoint = `${this.getBaseUrl()}/api/v1/parse/transactions`;
    let responseData: any = null;
    let lastError: any = null;

    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await this.httpClient.post(endpoint, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });
        responseData = res.data;
        break;
      } catch (err: any) {
        lastError = err;
        const status = err?.response?.status;
        const errMsg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'BSA request failed';

        this.logger.warn({
          event: 'bsa_parse_request_attempt_failed',
          attempt,
          status,
          error: errMsg,
          lan: input.lan,
        });

        // If 401 Unauthorized, refresh token and retry once
        if (status === 401 && attempt === 1) {
          this.logger.warn({
            event: 'bsa_token_expired_refreshing',
            lan: input.lan,
          });
          try {
            token = await this.getValidToken(true);
            continue;
          } catch {
            break;
          }
        }

        if (status === 403 || status === 400) {
          break;
        }

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    if (!responseData && lastError) {
      const errorMsg =
        lastError?.response?.data?.message ||
        lastError?.response?.data?.error ||
        lastError?.message ||
        'Failed to connect to Boost Money BSA API';

      const analysis = await this.prisma.customerBankStatementAnalysis.create({
        data: {
          customerId: BigInt(input.customerId),
          applicationId: input.applicationId ? BigInt(input.applicationId) : null,
          lan: input.lan,
          source: input.source || 'BANK_STATEMENT',
          parseStatus: 'FAILED',
          failureReason: String(errorMsg).slice(0, 1000),
          rawResponse: lastError?.response?.data ? JSON.stringify(lastError.response.data) : null,
        },
      });

      return {
        success: false,
        status: 'FAILED',
        parseStatus: 'FAILED',
        parseMessage: errorMsg,
        errors: lastError?.response?.data || lastError?.message,
        analysisRecordId: analysis.id.toString(),
      };
    }

    // Extract standardized BSA fields from response
    const resObj = responseData?.data || responseData || {};
    const jobId = resObj.jobId || resObj.job_id || responseData?.jobId;
    const rawStatus = resObj.status || responseData?.status;
    const accountUid =
      resObj.accountUID ||
      resObj.accountUid ||
      resObj.account_uid ||
      responseData?.accountUID ||
      responseData?.accountUid;
    const parseStatus = (
      resObj.parseStatus ||
      resObj.parse_status ||
      rawStatus ||
      ''
    ).toUpperCase();
    const parseMessage =
      resObj.parseMessage ||
      resObj.parse_message ||
      resObj.message ||
      responseData?.message;
    const errors = resObj.errors || responseData?.errors || null;

    const isSuccess =
      parseStatus === 'SUCCESS' ||
      rawStatus === 'SUCCESS' ||
      String(responseData?.status).toLowerCase() === 'success' ||
      Boolean(accountUid);

    const finalStatus = isSuccess ? 'SUCCESS' : 'FAILED';
    const failureReason = !isSuccess
      ? parseMessage || JSON.stringify(errors) || 'Bank statement parsing rejected by BSA'
      : null;

    const analysis = await this.prisma.customerBankStatementAnalysis.create({
      data: {
        customerId: BigInt(input.customerId),
        applicationId: input.applicationId ? BigInt(input.applicationId) : null,
        lan: input.lan,
        source: input.source || 'BANK_STATEMENT',
        jobId: jobId ? String(jobId) : null,
        accountUid: accountUid ? String(accountUid) : null,
        parseStatus: finalStatus,
        parseMessage: parseMessage ? String(parseMessage).slice(0, 500) : null,
        failureReason: failureReason ? String(failureReason).slice(0, 1000) : null,
        rawResponse: JSON.stringify(responseData),
      },
    });

    this.logger.log({
      event: 'bsa_parse_transactions_completed',
      lan: input.lan,
      customerId: String(input.customerId),
      accountUid,
      jobId,
      status: finalStatus,
      durationMs: Date.now() - startTime,
    });

    // If parsing succeeded and accountUid exists, trigger Fraud Analytics PDF download asynchronously
    if (isSuccess && accountUid) {
      this.downloadFraudAnalyticsPdf(accountUid, analysis.id).catch((pdfErr) => {
        this.logger.warn({
          event: 'bsa_async_fraud_pdf_download_error',
          accountUid,
          error: pdfErr?.message || pdfErr,
        });
      });
    }

    return {
      success: isSuccess,
      jobId: jobId ? String(jobId) : undefined,
      status: finalStatus,
      accountUID: accountUid ? String(accountUid) : undefined,
      parseStatus: finalStatus,
      parseMessage: parseMessage || undefined,
      errors: errors || undefined,
      rawResponse: responseData,
      analysisRecordId: analysis.id.toString(),
    };
  }

  /**
   * Download Fraud Analytics PDF Report from Boost Money BSA:
   * POST /api/v1/download/fraud/analytics/pdf/report
   */
  async downloadFraudAnalyticsPdf(
    accountUid: string,
    analysisId?: bigint | number,
  ): Promise<BsaFraudReportResult> {
    const cleanAccountUid = String(accountUid || '').trim();
    if (!cleanAccountUid) {
      return {
        success: false,
        accountUid: '',
        error: 'accountUid is required for fraud report download',
      };
    }

    let token = '';
    try {
      token = await this.getValidToken();
    } catch (tokenErr: any) {
      this.logger.warn({
        event: 'bsa_fraud_pdf_token_error',
        accountUid: cleanAccountUid,
        error: tokenErr?.message,
      });
      return {
        success: false,
        accountUid: cleanAccountUid,
        error: tokenErr?.message || 'BSA token generation failed.',
      };
    }

    const endpoint = `${this.getBaseUrl()}/api/v1/download/fraud/analytics/pdf/report`;
    const payload = { accountUid: cleanAccountUid };

    try {
      this.logger.log({
        event: 'bsa_download_fraud_pdf_started',
        accountUid: cleanAccountUid,
      });

      const response = await this.httpClient.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/pdf',
        },
        responseType: 'arraybuffer',
      });

      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const targetDir = path.join(
        process.cwd(),
        'uploads',
        'customer-documents',
        'fraud-analytics',
        year,
        month,
      );

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const filePath = path.join(targetDir, `${cleanAccountUid}.pdf`);
      fs.writeFileSync(filePath, Buffer.from(response.data));

      const relativeReportPath = path
        .join('uploads', 'customer-documents', 'fraud-analytics', year, month, `${cleanAccountUid}.pdf`)
        .replace(/\\/g, '/');

      // Update analysis record if provided
      if (analysisId !== undefined && analysisId !== null && String(analysisId).trim() !== '') {
        try {
          await this.prisma.customerBankStatementAnalysis.update({
            where: { id: BigInt(analysisId) },
            data: {
              fraudReportStatus: 'COMPLETED',
              fraudReportPath: relativeReportPath,
            },
          });
        } catch (dbErr: any) {
          this.logger.warn({
            event: 'bsa_fraud_report_db_update_warn',
            analysisId: String(analysisId),
            error: dbErr?.message,
          });
        }
      } else if (cleanAccountUid) {
        try {
          await this.prisma.customerBankStatementAnalysis.updateMany({
            where: { accountUid: cleanAccountUid },
            data: {
              fraudReportStatus: 'COMPLETED',
              fraudReportPath: relativeReportPath,
            },
          });
        } catch (dbErr: any) {
          this.logger.warn({
            event: 'bsa_fraud_report_db_update_warn',
            accountUid: cleanAccountUid,
            error: dbErr?.message,
          });
        }
      }

      this.logger.log({
        event: 'bsa_download_fraud_pdf_success',
        accountUid: cleanAccountUid,
        filePath: relativeReportPath,
      });

      return {
        success: true,
        accountUid: cleanAccountUid,
        reportPath: relativeReportPath,
      };
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Fraud analytics PDF download failed';

      this.logger.warn({
        event: 'bsa_download_fraud_pdf_failed',
        accountUid: cleanAccountUid,
        error: errMsg,
      });

      if (analysisId !== undefined && analysisId !== null && String(analysisId).trim() !== '') {
        try {
          await this.prisma.customerBankStatementAnalysis.update({
            where: { id: BigInt(analysisId) },
            data: {
              fraudReportStatus: 'FAILED',
            },
          });
        } catch { }
      }

      // Handled gracefully as non-blocking
      return {
        success: false,
        accountUid: cleanAccountUid,
        error: errMsg,
      };
    }
  }

  /**
   * Retrieve the list of supported banks from Boost Money BSA:
   * GET /api/v1/bank/list
   */
  async getBankList(): Promise<{
    success: boolean;
    status?: string;
    noOfBanks?: number;
    data: Array<{ bankCode: string; bankName: string }>;
    error?: string;
  }> {
    let token = '';
    try {
      token = await this.getValidToken();
    } catch (tokenErr: any) {
      this.logger.warn({
        event: 'bsa_get_bank_list_token_error',
        error: tokenErr?.message,
      });
      return {
        success: false,
        data: [],
        error: tokenErr?.message || 'BSA token generation failed.',
      };
    }

    const endpoint = `${this.getBaseUrl()}/api/v1/bank/list`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        this.logger.log({
          event: 'bsa_get_bank_list_started',
          attempt,
          endpoint,
        });

        const res = await this.httpClient.get(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const resData = res.data;
        const bankArray = Array.isArray(resData?.data)
          ? resData.data
          : Array.isArray(resData)
          ? resData
          : [];

        this.logger.log({
          event: 'bsa_get_bank_list_success',
          noOfBanks: resData?.noOfBanks || bankArray.length,
        });

        return {
          success: true,
          status: resData?.status || 'SUCCESS',
          noOfBanks: resData?.noOfBanks || bankArray.length,
          data: bankArray,
        };
      } catch (err: any) {
        const status = err?.response?.status;
        const errMsg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to retrieve bank list from BSA';

        this.logger.warn({
          event: 'bsa_get_bank_list_failed',
          attempt,
          status,
          error: errMsg,
        });

        if (status === 401 && attempt === 1) {
          try {
            token = await this.getValidToken(true);
            continue;
          } catch {
            break;
          }
        }

        return {
          success: false,
          data: [],
          error: errMsg,
        };
      }
    }

    return {
      success: false,
      data: [],
      error: 'Failed to retrieve bank list after retry.',
    };
  }

  /**
   * Retrieve Bank Account Summary (Savings / Current) from Boost Money BSA:
   * POST /api/v1/bank/account/summary
   */
  async getAccountSummary(accountUid: string): Promise<{
    success: boolean;
    accountUid: string;
    data?: any;
    error?: string;
  }> {
    const cleanAccountUid = String(accountUid || '').trim();
    if (!cleanAccountUid) {
      return {
        success: false,
        accountUid: '',
        error: 'accountUid is required to fetch account summary',
      };
    }

    let token = '';
    try {
      token = await this.getValidToken();
    } catch (tokenErr: any) {
      this.logger.warn({
        event: 'bsa_account_summary_token_error',
        accountUid: cleanAccountUid,
        error: tokenErr?.message,
      });
      return {
        success: false,
        accountUid: cleanAccountUid,
        error: tokenErr?.message || 'BSA token generation failed.',
      };
    }

    const endpoint = `${this.getBaseUrl()}/api/v1/bank/account/summary`;
    const payload = { accountUid: cleanAccountUid };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        this.logger.log({
          event: 'bsa_get_account_summary_started',
          accountUid: cleanAccountUid,
          attempt,
        });

        const res = await this.httpClient.post(endpoint, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });

        this.logger.log({
          event: 'bsa_get_account_summary_success',
          accountUid: cleanAccountUid,
        });

        return {
          success: true,
          accountUid: cleanAccountUid,
          data: res.data,
        };
      } catch (err: any) {
        const status = err?.response?.status;
        const errMsg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to retrieve bank account summary';

        this.logger.warn({
          event: 'bsa_get_account_summary_failed',
          accountUid: cleanAccountUid,
          attempt,
          status,
          error: errMsg,
        });

        if (status === 401 && attempt === 1) {
          try {
            token = await this.getValidToken(true);
            continue;
          } catch {
            break;
          }
        }

        return {
          success: false,
          accountUid: cleanAccountUid,
          error: errMsg,
        };
      }
    }

    return {
      success: false,
      accountUid: cleanAccountUid,
      error: 'Failed to retrieve bank account summary after retry.',
    };
  }

  /**
   * Retrieve Bank Account Monthly Summary Details from Boost Money BSA:
   * POST /api/v1/bank/account/monthly/summary/details
   */
  async getMonthlySummaryDetails(accountUid: string): Promise<{
    success: boolean;
    accountUid: string;
    data?: any;
    error?: string;
  }> {
    const cleanAccountUid = String(accountUid || '').trim();
    if (!cleanAccountUid) {
      return {
        success: false,
        accountUid: '',
        error: 'accountUid is required to fetch monthly summary details',
      };
    }

    let token = '';
    try {
      token = await this.getValidToken();
    } catch (tokenErr: any) {
      this.logger.warn({
        event: 'bsa_monthly_summary_token_error',
        accountUid: cleanAccountUid,
        error: tokenErr?.message,
      });
      return {
        success: false,
        accountUid: cleanAccountUid,
        error: tokenErr?.message || 'BSA token generation failed.',
      };
    }

    const endpoint = `${this.getBaseUrl()}/api/v1/bank/account/monthly/summary/details`;
    const payload = { accountUid: cleanAccountUid };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        this.logger.log({
          event: 'bsa_get_monthly_summary_started',
          accountUid: cleanAccountUid,
          attempt,
        });

        const res = await this.httpClient.post(endpoint, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });

        this.logger.log({
          event: 'bsa_get_monthly_summary_success',
          accountUid: cleanAccountUid,
        });

        return {
          success: true,
          accountUid: cleanAccountUid,
          data: res.data,
        };
      } catch (err: any) {
        const status = err?.response?.status;
        const errMsg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to retrieve monthly summary details';

        this.logger.warn({
          event: 'bsa_get_monthly_summary_failed',
          accountUid: cleanAccountUid,
          attempt,
          status,
          error: errMsg,
        });

        if (status === 401 && attempt === 1) {
          try {
            token = await this.getValidToken(true);
            continue;
          } catch {
            break;
          }
        }

        return {
          success: false,
          accountUid: cleanAccountUid,
          error: errMsg,
        };
      }
    }

    return {
      success: false,
      accountUid: cleanAccountUid,
      error: 'Failed to retrieve monthly summary details after retry.',
    };
  }

  /**
   * Upload multiple bank statement PDF files to Boost Money BSA:
   * POST /api/v1/uploadMultipleStatements
   */
  async uploadMultipleStatements(
    input: BsaUploadStatementsInput,
  ): Promise<BsaParseResponse> {
    const startTime = Date.now();
    this.logger.log({
      event: 'bsa_upload_statements_initiated',
      lan: input.lan,
      customerId: String(input.customerId),
      statementsCount: input.statements?.length || 0,
    });

    let token = '';
    try {
      token = await this.getValidToken();
    } catch (tokenErr: any) {
      this.logger.error({
        event: 'bsa_upload_token_error',
        message: tokenErr?.message,
        lan: input.lan,
      });
      const failedRecord = await this.prisma.customerBankStatementAnalysis.create({
        data: {
          customerId: BigInt(input.customerId),
          applicationId: input.applicationId ? BigInt(input.applicationId) : null,
          lan: input.lan,
          source: 'BANK_STATEMENT',
          parseStatus: 'FAILED',
          failureReason: tokenErr?.message || 'BSA token generation failed.',
        },
      });
      return {
        success: false,
        status: 'FAILED',
        parseStatus: 'FAILED',
        parseMessage: tokenErr?.message || 'BSA token generation failed.',
        errors: tokenErr?.message,
        analysisRecordId: failedRecord.id.toString(),
      };
    }

    const clientId = (this.configService.get<string>('BSA_CLIENT_ID') || 'fintree_finance_s7sw').trim();
    const endpoint = `${this.getBaseUrl()}/api/v1/uploadMultipleStatements`;
    let responseData: any = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const formData = new FormData();

        input.statements.forEach((stmt, idx) => {
          formData.append(`statement[${idx}].bank`, stmt.bank || 'Bank');
          formData.append(`statement[${idx}].accountType`, stmt.accountType || 'SAVINGS');
          if (stmt.employerDetails) {
            formData.append(`statement[${idx}].employerDetails`, stmt.employerDetails);
          }
          if (stmt.password) {
            formData.append(`statement[${idx}].password`, stmt.password);
          }
          if (stmt.accNo) {
            formData.append(`statement[${idx}].accNo`, stmt.accNo);
          }
          if (stmt.bankStmt) {
            const blob = new Blob([new Uint8Array(stmt.bankStmt.buffer)], {
              type: stmt.bankStmt.mimetype || 'application/pdf',
            });
            formData.append(
              `statement[${idx}].bankStmt`,
              blob,
              stmt.bankStmt.originalname || `statement_${idx + 1}.pdf`,
            );
          }
        });

        if (input.callbackUrl) {
          formData.append('callbackurl', input.callbackUrl);
        }

        const res = await this.httpClient.post(endpoint, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            businessUserId: clientId,
            referenceId: input.lan,
            'x-business-user-id': clientId,
            'x-reference-id': input.lan,
          },
        });
        responseData = res.data;
        break;
      } catch (err: any) {
        lastError = err;
        const status = err?.response?.status;
        const errMsg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'BSA uploadMultipleStatements failed';

        this.logger.warn({
          event: 'bsa_upload_statements_attempt_failed',
          attempt,
          status,
          error: errMsg,
          lan: input.lan,
        });

        if (status === 401 && attempt === 1) {
          try {
            token = await this.getValidToken(true);
            continue;
          } catch {
            break;
          }
        }
      }
    }

    const firstAcc = Array.isArray(responseData?.accountList) && responseData.accountList.length > 0
      ? responseData.accountList[0]
      : null;

    const accountUid =
      firstAcc?.accountUID ||
      firstAcc?.accountUid ||
      responseData?.accountUid ||
      responseData?.accountUID ||
      responseData?.data?.accountUid ||
      responseData?.data?.accountUID ||
      responseData?.account_uid ||
      null;

    const jobId =
      firstAcc?.jobId ||
      responseData?.jobId ||
      responseData?.data?.jobId ||
      responseData?.job_id ||
      responseData?.id ||
      null;

    const isSuccess =
      Boolean(responseData) &&
      (responseData?.status === 'SUCCESS' ||
        responseData?.status === 'PARSED' ||
        firstAcc?.parseStatus === 'CATEGORISED' ||
        firstAcc?.parseStatus === 'SUCCESS' ||
        responseData?.success === true ||
        Boolean(accountUid) ||
        Boolean(jobId));

    const finalStatus = isSuccess ? 'PARSED' : 'FAILED';
    const failureReason = isSuccess
      ? null
      : responseData?.message ||
      lastError?.response?.data?.message ||
      lastError?.message ||
      'BSA uploadMultipleStatements processing failed';

    // Persist to database
    const analysis = await this.prisma.customerBankStatementAnalysis.create({
      data: {
        customerId: BigInt(input.customerId),
        applicationId: input.applicationId ? BigInt(input.applicationId) : null,
        lan: input.lan,
        source: 'BANK_STATEMENT',
        jobId: jobId ? String(jobId) : null,
        accountUid: accountUid ? String(accountUid) : null,
        parseStatus: finalStatus,
        parseMessage:
          responseData?.message ||
          (isSuccess ? 'Bank statement uploaded and analyzed successfully' : null),
        failureReason: failureReason ? String(failureReason) : null,
        rawResponse: responseData
          ? JSON.stringify(responseData)
          : lastError?.response?.data
            ? JSON.stringify(lastError.response.data)
            : null,
      },
    });

    if (isSuccess && accountUid) {
      this.downloadFraudAnalyticsPdf(accountUid, analysis.id).catch((pdfErr) => {
        this.logger.warn({
          event: 'bsa_async_fraud_pdf_download_error',
          accountUid,
          error: pdfErr?.message || pdfErr,
        });
      });
    }

    this.logger.log({
      event: 'bsa_upload_statements_completed',
      lan: input.lan,
      customerId: String(input.customerId),
      accountUid,
      jobId,
      status: finalStatus,
      durationMs: Date.now() - startTime,
    });

    return {
      success: isSuccess, 
      jobId: jobId ? String(jobId) : undefined,
      status: finalStatus,
      accountUID: accountUid ? String(accountUid) : undefined,
      parseStatus: finalStatus,
      parseMessage: responseData?.message || undefined,
      rawResponse: responseData,
      analysisRecordId: analysis.id.toString(),
    };
  }
}
