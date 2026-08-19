import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { createHash, createCipheriv } from 'crypto';

export interface EasebuzzGenerateAccessKeyInput {
  transactionId: string;
  amount: number;
  successUrl: string;
  failureUrl: string;
  requestType?: string;
  email: string;
  phone: string;
  startDate: string;
  endDate: string;
  frequency?: string;
  amountRule?: string;
  paymentModes?: string[];
  accountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  accountType?: string;
  authMode?: string;
  subMerchantId?: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  udf6?: string;
  udf7?: string;
}

@Injectable()
export class EasebuzzAutocollectService {
  private readonly logger = new Logger(EasebuzzAutocollectService.name);
  private readonly axiosClient: AxiosInstance;

  private readonly merchantKey: string;
  private readonly merchantSalt: string;
  private readonly subMerchantId: string;
  private readonly apiBaseUrl: string;
  private readonly portalBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.merchantKey =
      this.configService.get<string>('EASEBUZZ_AUTOCOLLECT_KEY') ||
      this.configService.get<string>('EASEBUZZ_MERCHANT_KEY') || '';
    this.merchantSalt =
      this.configService.get<string>('EASEBUZZ_AUTOCOLLECT_SALT') ||
      this.configService.get<string>('EASEBUZZ_SALT') || '';
    this.subMerchantId =
      this.configService.get<string>('EASEBUZZ_AUTOCOLLECT_SUB_MERCHANT_ID') ||
      this.configService.get<string>('EASEBUZZ_SUB_MERCHANT_ID') || '';
    
    this.apiBaseUrl = (
      this.configService.get<string>('EASEBUZZ_AUTOCOLLECT_API_BASE_URL') ||
      'https://api.easebuzz.in'
    ).replace(/\/+$/, '');

    this.portalBaseUrl = (
      this.configService.get<string>('EASEBUZZ_AUTOCOLLECT_PORTAL_BASE_URL') ||
      'https://testpay.easebuzz.in/pay'
    ).replace(/\/+$/, '');

    const timeout = Number(this.configService.get<string>('EASEBUZZ_AUTOCOLLECT_TIMEOUT_MS') || '30000');

    this.axiosClient = axios.create({
      baseURL: this.apiBaseUrl,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Calculates SHA-512 hex digest
   */
  public sha512Hex(value: string): string {
    return createHash('sha512').update(value, 'utf8').digest('hex');
  }

  /**
   * AES-256-CBC transmission encryption for Easebuzz payload fields
   */
  public encryptEasebuzzField(value: string, encoding: 'base64' | 'hex' = 'base64'): string {
    if (!value) return '';
    if (!this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException('Easebuzz merchant key and salt are required for payload encryption.');
    }

    const keyHex = createHash('sha256').update(this.merchantKey, 'utf8').digest('hex');
    const saltHex = createHash('sha256').update(this.merchantSalt, 'utf8').digest('hex');

    const key = Buffer.from(keyHex.slice(0, 32), 'utf8');
    const iv = Buffer.from(saltHex.slice(0, 16), 'utf8');

    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

    return encrypted.toString(encoding);
  }

  private encryptWithKeyIv(value: string, keyBuf: Buffer, ivBuf: Buffer, encoding: 'base64' | 'hex' = 'base64'): string {
    const cipher = createCipheriv('aes-256-cbc', keyBuf, ivBuf);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return encrypted.toString(encoding);
  }

  /**
   * AES-256-CBC encryption for Easebuzz Mandate Creation API:
   * KEY = SHA-256(merchantKey) first 32 bytes
   * IV = SHA-256(merchantSalt) first 16 bytes
   */
  public encryptMandateField(value: string, encoding: 'base64' | 'hex' = 'base64'): string {
    if (!value) return '';
    const key = createHash('sha256').update(this.merchantKey, 'utf8').digest().slice(0, 32);
    const iv = createHash('sha256').update(this.merchantSalt, 'utf8').digest().slice(0, 16);

    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

    return encrypted.toString(encoding);
  }

  /**
   * SHA-512 Authorization Hash for ENACH & UPI Mandate Creation:
   * SHA-512(<key>|<encrypted_account_number>|<ifsc>|<upi_handle>|<salt>)
   */
  public generateMandateAuthHash(encryptedAccountNumber: string, ifsc: string, upiHandle: string = ''): string {
    const hashString = `${this.merchantKey}|${encryptedAccountNumber}|${ifsc}|${upiHandle}|${this.merchantSalt}`;
    return createHash('sha512').update(hashString, 'utf8').digest('hex');
  }

  /**
   * Builds official Mandate Creation payload & registers request
   */
  public async createMandateRegistration(input: {
    accessKey: string;
    accountNumber: string;
    accountHolderName: string;
    ifscCode: string;
    accountType?: string;
    authMode?: string;
    mandateType?: string;
  }) {
    const cleanAccountHolder = String(input.accountHolderName || '')
      .replace(/[^A-Za-z\s]/g, '')
      .trim()
      .slice(0, 40) || 'ACCOUNT HOLDER';

    const cleanIfsc = String(input.ifscCode || '').trim().toUpperCase();
    const bankCode = cleanIfsc.slice(0, 4);
    const rawAccType = (input.accountType || 'SAVINGS').toLowerCase();
    const cleanAccountType = rawAccType === 'current' ? 'current' : 'savings';

    // AES-256-CBC Encrypt sensitive fields
    const encryptedAccBase64 = this.encryptMandateField(input.accountNumber, 'base64');
    const encryptedNameBase64 = this.encryptMandateField(cleanAccountHolder, 'base64');
    const encryptedTypeBase64 = this.encryptMandateField(cleanAccountType, 'base64');

    const encryptedAccHex = this.encryptMandateField(input.accountNumber, 'hex');
    const encryptedNameHex = this.encryptMandateField(cleanAccountHolder, 'hex');
    const encryptedTypeHex = this.encryptMandateField(cleanAccountType, 'hex');

    // SHA-512 Authorization Hash
    const authHashBase64 = this.generateMandateAuthHash(encryptedAccBase64, cleanIfsc);
    const authHashHex = this.generateMandateAuthHash(encryptedAccHex, cleanIfsc);

    const mandateTypeStr = input.mandateType || 'ENACH';
    let authModeStr = input.authMode;
    if (!authModeStr) {
      if (mandateTypeStr === 'UPI') {
        authModeStr = 'collect_request,intent,qr';
      } else {
        authModeStr = 'netbanking,debitcard';
      }
    }

    const mandateFormDataBase64 = {
      key: this.merchantKey,
      access_key: input.accessKey,
      mandate_type: mandateTypeStr,
      account_number: encryptedAccBase64,
      account_holder_name: encryptedNameBase64,
      account_type: encryptedTypeBase64,
      ifsc: cleanIfsc,
      bank_code: bankCode,
      auth_mode: authModeStr,
      Authorization: authHashBase64,
    };

    const mandateFormDataHex = {
      key: this.merchantKey,
      access_key: input.accessKey,
      mandate_type: mandateTypeStr,
      account_number: encryptedAccHex,
      account_holder_name: encryptedNameHex,
      account_type: encryptedTypeHex,
      ifsc: cleanIfsc,
      bank_code: bankCode,
      auth_mode: authModeStr,
      Authorization: authHashHex,
    };

    const candidateEndpoints = [
      'https://pay.easebuzz.in/api/v1/mandate/create',
      'https://pay.easebuzz.in/v1/mandate/create',
      'https://api.easebuzz.in/autocollect/v1/mandate/create',
    ];

    for (const endpoint of candidateEndpoints) {
      for (const formPayload of [mandateFormDataBase64, mandateFormDataHex]) {
        try {
          const response = await axios.post(endpoint, formPayload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
          });
          if (response.data && (response.data.status || response.data.success)) {
            return {
              registered: true,
              mandateForm: formPayload,
              providerResponse: response.data,
            };
          }
        } catch {
          // Ignore candidate endpoint errors and return form payload
        }
      }
    }

    return {
      registered: false,
      mandateForm: mandateFormDataBase64,
      mandateFormHex: mandateFormDataHex,
    };
  }

  /**
   * Generates safe portal URL for access_key
   */
  public getPortalUrl(accessKey: string, matchedBaseUrl?: string): string {
    const targetUrl = matchedBaseUrl || this.apiBaseUrl;
    const isProd = (targetUrl.includes('api.easebuzz.in') || targetUrl.includes('pay.easebuzz.in')) && !targetUrl.includes('testpay') && !targetUrl.includes('sandbox');
    const defaultPortal = isProd ? 'https://pay.easebuzz.in/pay' : 'https://testpay.easebuzz.in/pay';

    let basePortal = (this.configService.get<string>('EASEBUZZ_AUTOCOLLECT_PORTAL_BASE_URL') || defaultPortal).replace(/\/+$/, '');
    if (isProd && basePortal.includes('testpay')) {
      basePortal = 'https://pay.easebuzz.in/pay';
    }

    return `${basePortal}/${encodeURIComponent(accessKey)}`;
  }

  /**
   * Generates Easebuzz Autocollect Access Key for Non-Seamless e-Mandate
   */
  async generateAccessKey(input: EasebuzzGenerateAccessKeyInput) {
    if (!this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException('Easebuzz Autocollect merchant credentials not configured.');
    }

    const rawSubMerchantId = (input.subMerchantId || this.subMerchantId || '').trim();
    const initialSubMerchantId = (rawSubMerchantId && rawSubMerchantId !== this.merchantKey) ? rawSubMerchantId : undefined;

    const amountString = input.amount.toFixed(2);
    const authInput = `${this.merchantKey}|${amountString}|${input.transactionId}|${this.merchantSalt}`;
    const authorization = this.sha512Hex(authInput);

    let cleanPhone = String(input.phone || '').replace(/\D/g, '').slice(-10);
    if (!/^[2-9]\d{9}$/.test(cleanPhone)) {
      cleanPhone = '9876543210';
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const startDate = input.startDate && input.startDate >= todayStr ? input.startDate : todayStr;

    const maskedTxId = `...${String(input.transactionId).slice(-8)}`;
    this.logger.log(`Initiating Easebuzz Autocollect access key [TxID: ${maskedTxId}, Amount: ${amountString}, SubMerchant: ${initialSubMerchantId || 'N/A'}]`);

    const candidateBases = Array.from(new Set([
      this.apiBaseUrl,
      'https://api.easebuzz.in',
      'https://pay.easebuzz.in',
      'https://sandboxapi.easebuzz.in',
      'https://testpay.easebuzz.in',
    ]));

    const subMerchantOptions = initialSubMerchantId ? [initialSubMerchantId, undefined] : [undefined];

    let lastError: any = null;

    for (const subMerchantId of subMerchantOptions) {
      const headers: Record<string, string> = {
        Authorization: authorization,
        'X-EB-MERCHANT-KEY': this.merchantKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (subMerchantId) {
        headers['X-EB-SUB-MERCHANT-ID'] = subMerchantId;
        headers['submerchant_id'] = subMerchantId;
        headers['sub_merchant_id'] = subMerchantId;
        headers['sub-merchant-id'] = subMerchantId;
      }

      const payload: Record<string, any> = {
        key: this.merchantKey,
        transaction_id: input.transactionId,
        success_url: input.successUrl,
        failure_url: input.failureUrl,
        request_type: input.requestType || 'DEFAULT',
        amount: Number(amountString),
        email: input.email,
        phone: cleanPhone,
        start_date: startDate,
        end_date: input.endDate,
        frequency: input.frequency || 'monthly',
        amount_rule: input.amountRule || 'MAX',
        payment_modes: input.paymentModes || ['EN'],
        udf1: input.udf1 || '',
        udf2: input.udf2 || '',
        udf3: input.udf3 || '',
        udf4: input.udf4 || '',
        udf5: input.udf5 || '',
        udf6: input.udf6 || '',
        udf7: input.udf7 || '',
        auth_amount_refund: false,
        mandate_atomicity: false,
        block_fund: false,
      };

      if (subMerchantId) {
        payload.submerchant_id = subMerchantId;
        payload.sub_merchant_id = subMerchantId;
        payload.sub_merchant = subMerchantId;
      }

      if (input.accountHolderName) {
        payload.customer_name = input.accountHolderName;
        payload.bank_account_holder_name = input.accountHolderName;
        payload.account_holder_name = input.accountHolderName;
      }

      if (input.accountType) {
        const mappedType = input.accountType.toUpperCase() === 'CURRENT' ? 'CURRENT' : 'SAVINGS';
        payload.bank_account_type = mappedType;
        payload.account_type = mappedType;
      }

      const configuredAuthMode = input.authMode || this.configService.get<string>('EASEBUZZ_MANDATE_AUTH_MODE') || undefined;
      if (configuredAuthMode) {
        payload.auth_mode = configuredAuthMode;
      }

      if (input.accountNumber && input.ifscCode) {
        const encryptedAcc = this.encryptEasebuzzField(input.accountNumber);
        payload.customer_account_details = [
          {
            account_number: encryptedAcc,
            ifsc: input.ifscCode,
          },
        ];
        payload.bank_account_number = input.accountNumber;
        payload.bank_ifsc = input.ifscCode;
        payload.ifsc = input.ifscCode;
      }

      for (const baseUrl of candidateBases) {
        const payloadWithoutAccount = { ...payload };
        delete payloadWithoutAccount.customer_account_details;
        delete payloadWithoutAccount.bank_account_number;

        const payloadsToTry: Record<string, any>[] = [];

        if (input.accountNumber && input.ifscCode) {
          // Candidate 1: Direct key (32) & salt (16)
          try {
            const keyDirect = Buffer.from(this.merchantKey.padEnd(32, '0').slice(0, 32), 'utf8');
            const ivDirect = Buffer.from(this.merchantSalt.padEnd(16, '0').slice(0, 16), 'utf8');
            const enc1 = this.encryptWithKeyIv(input.accountNumber, keyDirect, ivDirect, 'base64');
            payloadsToTry.push({
              ...payload,
              customer_account_details: [{ account_number: enc1, ifsc: input.ifscCode }],
            });
          } catch {}

          // Candidate 2: Direct key (32) & key IV (16)
          try {
            const keyDirect = Buffer.from(this.merchantKey.padEnd(32, '0').slice(0, 32), 'utf8');
            const ivKey = Buffer.from(this.merchantKey.padEnd(16, '0').slice(0, 16), 'utf8');
            const enc2 = this.encryptWithKeyIv(input.accountNumber, keyDirect, ivKey, 'base64');
            payloadsToTry.push({
              ...payload,
              customer_account_details: [{ account_number: enc2, ifsc: input.ifscCode }],
            });
          } catch {}

          // Candidate 3: Hex SHA256 Slices (Base64)
          payloadsToTry.push(payload);

          // Candidate 4: Hex SHA256 Slices (Hex)
          try {
            const encryptedAccHex = this.encryptEasebuzzField(input.accountNumber, 'hex');
            payloadsToTry.push({
              ...payload,
              customer_account_details: [{ account_number: encryptedAccHex, ifsc: input.ifscCode }],
            });
          } catch {}

          // Candidate 5: Plain Account Number (unencrypted string)
          payloadsToTry.push({
            ...payload,
            customer_account_details: [{ account_number: input.accountNumber, ifsc: input.ifscCode }],
          });
        }

        // Final fallback: Payload without customer_account_details
        payloadsToTry.push(payloadWithoutAccount);

        for (const currentPayload of payloadsToTry) {
          try {
            const response = await axios.post(
              `${baseUrl.replace(/\/+$/, '')}/autocollect/v1/access-key/generate/`,
              currentPayload,
              { headers, timeout: 30000 }
            );

            const resData = response.data;
            const status = resData?.status ?? resData?.success;
            const resStr = JSON.stringify(resData || {});

            if (!resData || (status !== true && status !== 1 && String(status).toLowerCase() !== 'success' && !resData?.access_key)) {
              if (resStr.includes('ADVA00001')) {
                // Silently try next prefill candidate or standard payload
                lastError = new BadRequestException('Easebuzz prefill decryption rejected by provider.');
                continue;
              }

              const errorMsg = resData?.data || resData?.error || resData?.message || 'Failed generating Easebuzz access key.';
              this.logger.warn(`Base URL ${baseUrl} returned non-success response: ${resStr}`);
              if (typeof errorMsg === 'string' && errorMsg.toLowerCase().includes('invalid submerchant id')) {
                this.logger.warn(`Base URL ${baseUrl} returned 'Invalid SubMerchant ID'. Retrying without subMerchantId...`);
                lastError = new BadRequestException(errorMsg);
                break;
              }
              if (typeof errorMsg === 'string' && errorMsg.toLowerCase().includes('invalid merchant key')) {
                this.logger.warn(`Base URL ${baseUrl} returned 'Invalid Merchant key'. Trying next candidate...`);
                lastError = new BadRequestException(errorMsg);
                break;
              }
              lastError = new BadRequestException(typeof errorMsg === 'string' ? errorMsg : 'Mandate initiation failed at provider.');
              continue;
            }

            const accessKey = resData?.access_key || resData?.data?.access_key || resData?.data;
            if (!accessKey || typeof accessKey !== 'string') {
              throw new BadRequestException('Provider did not return a valid mandate access key.');
            }

            return {
              success: true,
              accessKey,
              portalUrl: this.getPortalUrl(accessKey, baseUrl),
              rawResponse: this.sanitizeEasebuzzMandatePayload(resData),
            };
          } catch (err: any) {
            if (err instanceof BadRequestException && (err.message.toLowerCase().includes('invalid merchant key') || err.message.toLowerCase().includes('invalid submerchant id'))) {
              break;
            }
            const errorData = err?.response?.data;
            const errStr = JSON.stringify(errorData || err?.message || '');
            if (errStr.includes('ADVA00001')) {
              // Silently try next prefill candidate or standard payload without logging warnings
              lastError = err;
              continue;
            }

            const msg = errorData?.message || errorData?.error || errorData?.data || err?.message || 'Access key request failed.';
            this.logger.warn(`Access key request failed on ${baseUrl}: ${JSON.stringify(errorData || msg)}`);
            lastError = err;
          }
        }
      }
    }

    const finalMsg = lastError?.response?.data?.message || lastError?.response?.data?.error || lastError?.response?.data?.data || lastError?.message || 'Access key request failed across candidate gateways.';
    throw new ServiceUnavailableException(`Easebuzz Mandate Service error: ${finalMsg}`);
  }

  /**
   * Retrieves mandate status from Easebuzz
   */
  async retrieveMandate(transactionId: string) {
    if (!this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException('Easebuzz credentials not configured.');
    }

    const subMerchantId = this.subMerchantId;
    const authInput = `${this.merchantKey}|${transactionId}|${this.merchantSalt}`;
    const authorization = this.sha512Hex(authInput);

    const headers: Record<string, string> = {
      Authorization: authorization,
      'X-EB-MERCHANT-KEY': this.merchantKey,
      Accept: 'application/json',
    };

    if (subMerchantId) {
      headers['X-EB-SUB-MERCHANT-ID'] = subMerchantId;
      headers['sub_merchant_id'] = subMerchantId;
      headers['submerchant_id'] = subMerchantId;
      headers['sub-merchant-id'] = subMerchantId;
    }

    const candidateBases = Array.from(new Set([
      this.apiBaseUrl,
      'https://pay.easebuzz.in',
      'https://dashboard.easebuzz.in',
      'https://testpay.easebuzz.in',
      'https://sandboxapi.easebuzz.in',
    ]));

    let lastError: any = null;

    for (const baseUrl of candidateBases) {
      try {
        let url = `${baseUrl.replace(/\/+$/, '')}/autocollect/v1/mandate/${encodeURIComponent(transactionId)}/?key=${encodeURIComponent(this.merchantKey)}`;
        if (subMerchantId) {
          url += `&sub_merchant_id=${encodeURIComponent(subMerchantId)}&submerchant_id=${encodeURIComponent(subMerchantId)}`;
        }
        const response = await axios.get(url, { headers, timeout: 30000 });
        const resData = response.data;

        return {
          success: true,
          data: resData?.data || resData,
          sanitizedResponse: this.sanitizeEasebuzzMandatePayload(resData),
        };
      } catch (err: any) {
        lastError = err;
      }
    }

    const msg = lastError?.response?.data?.message || lastError?.message || 'Retrieve mandate request failed.';
    this.logger.error(`Easebuzz retrieve mandate exception [TxID: ${transactionId}]: ${msg}`);
    throw new ServiceUnavailableException(`Unable to retrieve mandate status from provider: ${msg}`);
  }

  public verifyEasebuzzMandateWebhookHash(payload: any): boolean {
    try {
      const data = payload?.data || {};
      const auth = String(
        data.authorization ||
        payload?.authorization ||
        data.auth ||
        payload?.auth ||
        data.hash ||
        payload?.hash ||
        ''
      ).trim();
      if (!auth) return false;

      const key = this.merchantKey;
      const salt = this.merchantSalt;

      const transactionId = String(
        data.transaction_id ||
        data?.mandate?.transaction_id ||
        data?.txnid ||
        payload?.transaction_id ||
        payload?.txnid ||
        ''
      ).trim();
      const merchantRequestNumber = String(
        data.merchant_request_number ||
        data.merchant_request_no ||
        data.merchant_transaction_id ||
        data?.mandate?.merchant_transaction_id ||
        ''
      ).trim();
      const status = String(
        data.status ||
        data.status_at_bank ||
        data?.mandate?.status ||
        data?.transaction_status ||
        payload?.status ||
        ''
      ).trim();
      const amount = String(
        data.amount ??
        data?.mandate?.amount ??
        payload?.amount ??
        ''
      ).trim();
      const accountNumber = String(
        data.customer_account_number ||
        data.customer_account_no ||
        data?.mandate?.customer_account_number ||
        data.account_number ||
        payload?.account_number ||
        ''
      ).trim();
      const ifsc = String(
        data.customer_ifsc ||
        data?.mandate?.customer_ifsc ||
        data?.mandate?.ifsc ||
        data.ifsc ||
        payload?.ifsc ||
        ''
      ).trim();
      const upiHandle = String(
        data.customer_upi_handle ||
        data?.mandate?.customer_upi_handle ||
        data?.mandate?.upi_handle ||
        data.upi_handle ||
        payload?.upi_handle ||
        ''
      ).trim();

      const candidates: string[] = [];

      if (transactionId && merchantRequestNumber && status) {
        candidates.push(`${key}|${transactionId}|${merchantRequestNumber}|${status}|${salt}`);
      }
      if (transactionId && status) {
        candidates.push(`${key}|${transactionId}|${status}|${salt}`);
      }
      if (transactionId && amount && accountNumber && ifsc) {
        candidates.push(`${key}|${transactionId}|${amount}|${accountNumber}|${ifsc}|${upiHandle}|${salt}`);
      }
      if (transactionId && merchantRequestNumber && status && !candidates.length) {
        candidates.push(`${key}|${transactionId}|${merchantRequestNumber}|${status}|${salt}`);
      }

      for (const sequence of candidates) {
        const computedHash = createHash('sha512').update(sequence, 'utf8').digest('hex');
        if (computedHash === auth) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Sanitizes payload by stripping sensitive credentials, keys, salts, and raw account data
   */
  public sanitizeEasebuzzMandatePayload(payload: any): any {
    if (!payload || typeof payload !== 'object') return payload;

    const copy = JSON.parse(JSON.stringify(payload));
    const sensitiveKeys = [
      'key',
      'salt',
      'merchant_key',
      'merchantKey',
      'merchant_salt',
      'authorization',
      'access_key',
      'accessKey',
      'account_number',
      'customer_account_number',
      'card_number',
      'card_cvv',
      'cryptogram',
      'upi_handle',
    ];

    const sanitizeRecursive = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      for (const k of Object.keys(obj)) {
        if (sensitiveKeys.includes(k.toLowerCase())) {
          if (typeof obj[k] === 'string' && obj[k].length > 4) {
            obj[k] = `***${obj[k].slice(-4)}`;
          } else {
            obj[k] = '***REDACTED***';
          }
        } else if (typeof obj[k] === 'object') {
          sanitizeRecursive(obj[k]);
        }
      }
    };

    sanitizeRecursive(copy);
    return copy;
  }

  /**
   * Generates SHA-512 Authorization Hash for eNACH Presentment / UPI / SI Execute API:
   * SHA-512(<key>|<transaction_id>|<merchant_request_number>|<amount>|<salt>)
   */
  public generatePresentmentHash(input: {
    key?: string;
    transactionId: string;
    merchantRequestNumber: string;
    amount: number;
    salt?: string;
  }): string {
    const key = input.key || this.merchantKey;
    const salt = input.salt || this.merchantSalt;
    const amountStr = Number(input.amount).toFixed(2);
    const hashInput = `${key}|${input.transactionId}|${input.merchantRequestNumber}|${amountStr}|${salt}`;
    return this.sha512Hex(hashInput);
  }

  /**
   * Generates SHA-512 Authorization Hash for GET Mandate Presentment Status API:
   * SHA-512(<key>|<created_at_start>|<created_at_end>|<created_at>|<salt>)
   */
  public generatePresentmentListHash(input: {
    key?: string;
    createdAtStart?: string;
    createdAtEnd?: string;
    createdAt?: string;
    salt?: string;
  }): string {
    const key = input.key || this.merchantKey;
    const salt = input.salt || this.merchantSalt;
    const start = input.createdAtStart || '';
    const end = input.createdAtEnd || '';
    const date = input.createdAt || '';
    const hashInput = `${key}|${start}|${end}|${date}|${salt}`;
    return this.sha512Hex(hashInput);
  }

  /**
   * Initiates eNACH Presentment API:
   * POST /autocollect/v1/mandate/presentment/
   */
  async initiateEnachPresentment(input: {
    transactionId: string;
    amount: number;
    merchantRequestNumber: string;
    presentmentDate: string;
    udf1?: string;
    udf2?: string;
    udf3?: string;
    udf4?: string;
    udf5?: string;
    udf6?: string;
    udf7?: string;
    fetchBalance?: boolean;
    forcePresentment?: boolean;
    subMerchantId?: string;
  }): Promise<{
    success: boolean;
    isUnknown?: boolean;
    data?: any;
    error?: string;
    rawResponse?: any;
  }> {
    if (!this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException('Easebuzz merchant credentials not configured.');
    }

    const authorization = this.generatePresentmentHash({
      transactionId: input.transactionId,
      merchantRequestNumber: input.merchantRequestNumber,
      amount: input.amount,
    });

    const subMerchantId = input.subMerchantId || this.subMerchantId;
    const headers: Record<string, string> = {
      Authorization: authorization,
      'X-EB-MERCHANT-KEY': this.merchantKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (subMerchantId) {
      headers['X-EB-SUB-MERCHANT-ID'] = subMerchantId;
    }

    const envFetchBalance = this.configService.get<string>('EASEBUZZ_PRESENTMENT_FETCH_BALANCE') === 'true';
    const envForce = this.configService.get<string>('EASEBUZZ_PRESENTMENT_FORCE') === 'true';

    const payload: Record<string, any> = {
      key: this.merchantKey,
      transaction_id: input.transactionId,
      amount: Number(Number(input.amount).toFixed(2)),
      merchant_request_number: input.merchantRequestNumber,
      presentment_date: input.presentmentDate,
      udf1: input.udf1 || '',
      udf2: input.udf2 || '',
      udf3: input.udf3 || '',
      udf4: input.udf4 || '',
      udf5: input.udf5 || '',
      udf6: input.udf6 || '',
      udf7: input.udf7 || '',
      fetch_balance: input.fetchBalance ?? envFetchBalance,
      force_presentment: input.forcePresentment ?? envForce,
    };

    const endpoint = `${this.apiBaseUrl.replace(/\/+$/, '')}/autocollect/v1/mandate/presentment/`;

    try {
      const response = await this.axiosClient.post(endpoint, payload, { headers, timeout: 30000 });
      const resData = response.data;
      const status = resData?.status ?? resData?.success;
      const isSuccess = status === true || status === 1 || String(status).toLowerCase() === 'success';

      return {
        success: isSuccess,
        data: resData?.data || resData,
        rawResponse: this.sanitizeEasebuzzMandatePayload(resData),
        error: !isSuccess ? (resData?.message || resData?.error || 'Presentment request rejected.') : undefined,
      };
    } catch (err: any) {
      const is5xxOrTimeout =
        !err.response ||
        (err.response.status >= 500 && err.response.status < 600) ||
        ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(err.code);

      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Presentment network failure.';
      this.logger.warn(`eNACH presentment exception [MerchantReq: ${input.merchantRequestNumber}, Is5xx/Timeout: ${is5xxOrTimeout}]: ${errorMsg}`);

      return {
        success: false,
        isUnknown: is5xxOrTimeout,
        error: errorMsg,
        rawResponse: err.response?.data ? this.sanitizeEasebuzzMandatePayload(err.response.data) : null,
      };
    }
  }

  /**
   * Pre-debit Notification API for UPI Mandates:
   * POST /autocollect/v1/mandate/notification/
   */
  async sendUpiPreDebitNotification(input: {
    transactionId: string;
    amount: number;
    merchantRequestNumber: string;
    debitDate: string;
    udf1?: string;
    udf2?: string;
    udf3?: string;
    udf4?: string;
    subMerchantId?: string;
  }): Promise<{
    success: boolean;
    isUnknown?: boolean;
    notificationRequestNumber?: string;
    data?: any;
    error?: string;
    rawResponse?: any;
  }> {
    if (!this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException('Easebuzz merchant credentials not configured.');
    }

    const authorization = this.generatePresentmentHash({
      transactionId: input.transactionId,
      merchantRequestNumber: input.merchantRequestNumber,
      amount: input.amount,
    });

    const subMerchantId = input.subMerchantId || this.subMerchantId;
    const headers: Record<string, string> = {
      Authorization: authorization,
      'X-EB-MERCHANT-KEY': this.merchantKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (subMerchantId) {
      headers['X-EB-SUB-MERCHANT-ID'] = subMerchantId;
    }

    const payload: Record<string, any> = {
      key: this.merchantKey,
      transaction_id: input.transactionId,
      amount: Number(Number(input.amount).toFixed(2)),
      merchant_request_number: input.merchantRequestNumber,
      debit_date: input.debitDate,
      udf1: input.udf1 || '',
      udf2: input.udf2 || '',
      udf3: input.udf3 || '',
      udf4: input.udf4 || '',
    };

    const candidateUrls = [
      `${this.apiBaseUrl.replace(/\/+$/, '')}/autocollect/v1/mandate/notification/`,
      `${this.apiBaseUrl.replace(/\/+$/, '')}/autocollect/v1/mandate/pre_debit_notification/`,
    ];

    let lastRes: any = null;
    let lastErr: any = null;

    for (const endpoint of candidateUrls) {
      try {
        const response = await this.axiosClient.post(endpoint, payload, { headers, timeout: 30000 });
        const resData = response.data;
        const status = resData?.status ?? resData?.success;
        const isSuccess = status === true || status === 1 || String(status).toLowerCase() === 'success';

        const notifNumber =
          resData?.notification_request_number ||
          resData?.data?.notification_request_number ||
          resData?.request_id ||
          resData?.data?.request_id ||
          input.merchantRequestNumber;

        if (isSuccess) {
          return {
            success: true,
            notificationRequestNumber: notifNumber,
            data: resData?.data || resData,
            rawResponse: this.sanitizeEasebuzzMandatePayload(resData),
          };
        }
        lastRes = resData;
      } catch (err: any) {
        lastErr = err;
      }
    }

    const is5xxOrTimeout =
      !lastErr?.response ||
      (lastErr?.response?.status >= 500 && lastErr?.response?.status < 600) ||
      ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(lastErr?.code);

    const errorMsg = lastRes?.message || lastRes?.error || lastErr?.response?.data?.message || lastErr?.message || 'Pre-debit notification failed.';
    return {
      success: false,
      isUnknown: is5xxOrTimeout,
      error: errorMsg,
      rawResponse: lastErr?.response?.data ? this.sanitizeEasebuzzMandatePayload(lastErr.response.data) : null,
    };
  }

  /**
   * Execute API for UPI / SI Mandates:
   * POST /autocollect/v1/mandate/execute/
   */
  async executeUpiOrSiDebit(input: {
    transactionId: string;
    amount: number;
    merchantRequestNumber: string;
    notificationRequestNumber?: string;
    udf1?: string;
    udf2?: string;
    udf3?: string;
    udf4?: string;
    subMerchantId?: string;
  }): Promise<{
    success: boolean;
    isUnknown?: boolean;
    data?: any;
    error?: string;
    rawResponse?: any;
  }> {
    if (!this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException('Easebuzz merchant credentials not configured.');
    }

    const authorization = this.generatePresentmentHash({
      transactionId: input.transactionId,
      merchantRequestNumber: input.merchantRequestNumber,
      amount: input.amount,
    });

    const subMerchantId = input.subMerchantId || this.subMerchantId;
    const headers: Record<string, string> = {
      Authorization: authorization,
      'X-EB-MERCHANT-KEY': this.merchantKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (subMerchantId) {
      headers['X-EB-SUB-MERCHANT-ID'] = subMerchantId;
    }

    const payload: Record<string, any> = {
      key: this.merchantKey,
      transaction_id: input.transactionId,
      amount: Number(Number(input.amount).toFixed(2)),
      merchant_request_number: input.merchantRequestNumber,
      udf1: input.udf1 || '',
      udf2: input.udf2 || '',
      udf3: input.udf3 || '',
      udf4: input.udf4 || '',
    };

    if (input.notificationRequestNumber) {
      payload.notification_request_number = input.notificationRequestNumber;
    }

    const endpoint = `${this.apiBaseUrl.replace(/\/+$/, '')}/autocollect/v1/mandate/execute/`;

    try {
      const response = await this.axiosClient.post(endpoint, payload, { headers, timeout: 30000 });
      const resData = response.data;
      const status = resData?.status ?? resData?.success;
      const isSuccess = status === true || status === 1 || String(status).toLowerCase() === 'success';

      return {
        success: isSuccess,
        data: resData?.data || resData,
        rawResponse: this.sanitizeEasebuzzMandatePayload(resData),
        error: !isSuccess ? (resData?.message || resData?.error || 'Execute request rejected.') : undefined,
      };
    } catch (err: any) {
      const is5xxOrTimeout =
        !err.response ||
        (err.response.status >= 500 && err.response.status < 600) ||
        ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(err.code);

      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Mandate execute network failure.';
      this.logger.warn(`UPI/SI execute exception [MerchantReq: ${input.merchantRequestNumber}, Is5xx/Timeout: ${is5xxOrTimeout}]: ${errorMsg}`);

      return {
        success: false,
        isUnknown: is5xxOrTimeout,
        error: errorMsg,
        rawResponse: err.response?.data ? this.sanitizeEasebuzzMandatePayload(err.response.data) : null,
      };
    }
  }

  /**
   * Retrieves Presentment / Debit Requests Status from Easebuzz:
   * GET /autocollect/v1/mandate/presentment
   */
  async getDebitRequests(input: {
    merchantRequestNumber?: string;
    createdAtStart?: string;
    createdAtEnd?: string;
    createdAt?: string;
    mandateId?: string;
    mandateTransactionId?: string;
    mandateType?: string;
    notificationRequestNumber?: string;
    status?: string;
    pageSize?: number;
    current?: number;
    subMerchantId?: string;
  }): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    sanitizedResponse?: any;
  }> {
    if (!this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException('Easebuzz merchant credentials not configured.');
    }

    const createdAt = input.createdAt || (!input.createdAtStart && !input.createdAtEnd ? new Date().toISOString().slice(0, 10) : undefined);

    const authorization = this.generatePresentmentListHash({
      createdAtStart: input.createdAtStart,
      createdAtEnd: input.createdAtEnd,
      createdAt,
    });

    const subMerchantId = input.subMerchantId || this.subMerchantId;
    const headers: Record<string, string> = {
      Authorization: authorization,
      'X-EB-MERCHANT-KEY': this.merchantKey,
      Accept: 'application/json',
    };
    if (subMerchantId) {
      headers['X-EB-SUB-MERCHANT-ID'] = subMerchantId;
    }

    const queryParams = new URLSearchParams();
    queryParams.append('key', this.merchantKey);
    if (input.merchantRequestNumber) queryParams.append('merchant_request_number', input.merchantRequestNumber);
    if (input.createdAtStart) queryParams.append('created_at_start', input.createdAtStart);
    if (input.createdAtEnd) queryParams.append('created_at_end', input.createdAtEnd);
    if (createdAt) queryParams.append('created_at', createdAt);
    if (input.mandateId) queryParams.append('mandate_id', input.mandateId);
    if (input.mandateTransactionId) queryParams.append('mandate_transaction_id', input.mandateTransactionId);
    if (input.mandateType) queryParams.append('mandate_type', input.mandateType);
    if (input.notificationRequestNumber) queryParams.append('notification_request_number', input.notificationRequestNumber);
    if (input.status) queryParams.append('status', input.status);
    if (input.pageSize) queryParams.append('pageSize', String(Math.min(100, Math.max(1, input.pageSize || 50))));
    if (input.current) queryParams.append('current', String(Math.max(1, input.current || 1)));

    const endpoint = `${this.apiBaseUrl.replace(/\/+$/, '')}/autocollect/v1/mandate/presentment?${queryParams.toString()}`;

    try {
      const response = await this.axiosClient.get(endpoint, { headers, timeout: 30000 });
      const resData = response.data;

      return {
        success: true,
        data: resData?.data || resData,
        sanitizedResponse: this.sanitizeEasebuzzMandatePayload(resData),
      };
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Get debit requests failed.';
      this.logger.error(`Easebuzz getDebitRequests error: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        sanitizedResponse: err.response?.data ? this.sanitizeEasebuzzMandatePayload(err.response.data) : null,
      };
    }
  }

  /**
   * Verifies mandate status safely before initiating debit
   */
  async getMandateStatus(transactionId: string): Promise<{
    isActive: boolean;
    status: string;
    raw?: any;
  }> {
    try {
      const res = await this.retrieveMandate(transactionId);
      if (!res.success || !res.data) {
        return { isActive: false, status: 'UNKNOWN' };
      }

      const rawStatus = String(
        res.data.status ||
        res.data.mandate_status ||
        res.data.state ||
        res.data.provider_status ||
        ''
      ).toUpperCase();

      const isActive = ['AUTHORIZED', 'ACTIVE', 'COMPLETED', 'SUCCESS'].includes(rawStatus);

      return {
        isActive,
        status: rawStatus || 'UNKNOWN',
        raw: res.sanitizedResponse,
      };
    } catch (err: any) {
      this.logger.warn(`getMandateStatus failed for TxID ${transactionId}: ${err?.message || err}`);
      return { isActive: false, status: 'UNKNOWN' };
    }
  }
}

