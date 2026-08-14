import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import axios from 'axios';
import { createHash } from 'crypto';

export type InitiateEasebuzzPaymentInput = {
  txnid: string;
  amount: number;
  productinfo: string;
  firstname: string;
  phone: string;
  email: string;
  surl: string;
  furl: string;

  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  udf6?: string;
  udf7?: string;

  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  country?: string;
  zipcode?: string;
  uniqueId?: string;
};

type EasebuzzInitiateSuccessResponse = {
  status?: number | string | boolean;
  data?: string | {
    access_key?: string;
    accessKey?: string;
  };
  access_key?: string;
  accessKey?: string;
  message?: string;
  error_desc?: string;
};

const PL_EASEBUZZ_TIMEOUT = Number(
  process.env.PL_EASEBUZZ_TIMEOUT || 30000,
);

function getEnvironmentValue(
  keys: string[],
): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  throw new InternalServerErrorException(
    `Missing environment variable: ${keys.join(' or ')}`,
  );
}

function getEasebuzzKey(): string {
  return getEnvironmentValue([
    'EASEBUZZ_KEY',
    'EASEBUZZ_WIRE_API_KEY',
    'PL_EASEBUZZ_KEY',
  ]);
}

function getEasebuzzSalt(): string {
  return getEnvironmentValue([
    'EASEBUZZ_SALT',
    'PL_EASEBUZZ_SALT',
  ]);
}

function getInitiateUrl(): string {
  return (
    process.env.EASEBUZZ_INITIATE_URL?.trim() ||
    process.env.PL_EASEBUZZ_INITIATE_URL?.trim() ||
    'https://testpay.easebuzz.in/payment/initiateLink'
  );
}

function getEasebuzzEnvironment(): 'test' | 'prod' {
  const initiateUrl = getInitiateUrl().toLowerCase();

  if (initiateUrl.includes('testpay.easebuzz.in')) {
    return 'test';
  }

  if (initiateUrl.includes('pay.easebuzz.in')) {
    return 'prod';
  }

  const environment = String(
    process.env.EASEBUZZ_ENV ||
    process.env.PL_EASEBUZZ_ENV ||
    'test',
  )
    .trim()
    .toLowerCase();

  return environment === 'prod' ? 'prod' : 'test';
}

function formatAmount(
  amountInput: number,
): string {
  const amount = Number(amountInput);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new BadRequestException(
      'Invalid Easebuzz payment amount.',
    );
  }

  if (amount > 9999999) {
    throw new BadRequestException(
      'Payment amount exceeds the permitted limit.',
    );
  }

  return amount.toFixed(2);
}

function cleanTransactionId(
  value: string,
): string {
  const txnid = String(value || '')
    .trim()
    .slice(0, 40);

  if (
    !/^[a-zA-Z0-9_|/\\-]{1,40}$/.test(
      txnid,
    )
  ) {
    throw new BadRequestException(
      'Invalid Easebuzz transaction ID.',
    );
  }

  return txnid;
}

function cleanProductInfo(
  value: string,
): string {
  const productinfo = String(
    value || 'PROCESSING FEE',
  )
    .replace(
      /[^a-zA-Z0-9\s|\-]/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 45);

  if (!productinfo) {
    throw new BadRequestException(
      'Product information is required.',
    );
  }

  return productinfo;
}

function cleanCustomerName(
  value: string,
): string {
  const firstname = String(
    value || 'Customer',
  )
    .replace(
      /[^a-zA-Z0-9&\-._ \()/,@]/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);

  if (!firstname) {
    throw new BadRequestException(
      'Customer name is required.',
    );
  }

  return firstname;
}

function cleanPhone(
  value: string,
): string {
  let phone = String(value || '')
    .trim()
    .replace(/[^\d+]/g, '');

  if (
    phone.startsWith('+91') &&
    phone.length === 13
  ) {
    phone = phone.slice(3);
  }

  if (
    phone.startsWith('91') &&
    phone.length === 12
  ) {
    phone = phone.slice(2);
  }

  if (
    !/^[6-9][0-9]{9}$/.test(phone)
  ) {
    throw new BadRequestException(
      'A valid 10-digit mobile number is required.',
    );
  }

  return phone;
}

function cleanEmail(
  value: string,
): string {
  const email = String(value || '')
    .trim()
    .toLowerCase()
    .slice(0, 200);

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email,
    )
  ) {
    throw new BadRequestException(
      'A valid customer email is required.',
    );
  }

  return email;
}

function cleanUrl(
  value: string,
  fieldName: string,
): string {
  const url = String(value || '').trim();

  if (!url) {
    throw new BadRequestException(
      `${fieldName} is required.`,
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new BadRequestException(
      `${fieldName} must be a valid URL.`,
    );
  }

  if (
    parsedUrl.protocol !== 'http:' &&
    parsedUrl.protocol !== 'https:'
  ) {
    throw new BadRequestException(
      `${fieldName} must use HTTP or HTTPS.`,
    );
  }

  return url.slice(0, 2000);
}

function cleanUdf(
  value: unknown,
): string {
  return String(value || '')
    .replace(
      /[^a-zA-Z.0-9/\\,\s_#@\-=+&]/g,
      '',
    )
    .trim()
    .slice(0, 300);
}

function cleanOptionalText(
  value: unknown,
  maximumLength: number,
): string {
  return String(value || '')
    .trim()
    .slice(0, maximumLength);
}

export function buildPlIframeHash(input: {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;

  udf1: string;
  udf2: string;
  udf3: string;
  udf4: string;
  udf5: string;
  udf6: string;
  udf7: string;

  salt: string;
}): string {
  /*
   * Easebuzz payment gateway hash:
   *
   * key|txnid|amount|productinfo|firstname|email|
   * udf1|udf2|udf3|udf4|udf5|
   * udf6|udf7|udf8|udf9|udf10|salt
   *
   * udf8, udf9 and udf10 are empty here.
   */
  const hashSequence = [
    String(input.key || '').trim(),
    String(input.txnid || '').trim(),
    String(input.amount || '').trim(),
    String(input.productinfo || '').trim(),
    String(input.firstname || '').trim(),
    String(input.email || '').trim(),

    String(input.udf1 || '').trim(),
    String(input.udf2 || '').trim(),
    String(input.udf3 || '').trim(),
    String(input.udf4 || '').trim(),
    String(input.udf5 || '').trim(),
    String(input.udf6 || '').trim(),
    String(input.udf7 || '').trim(),

    '',
    '',
    '',

    String(input.salt || '').trim(),
  ].join('|');

  return createHash('sha512')
    .update(hashSequence)
    .digest('hex');
}

function isEasebuzzSuccessStatus(
  status: unknown,
): boolean {
  return (
    status === 1 ||
    status === '1' ||
    status === true ||
    String(status || '')
      .trim()
      .toLowerCase() === 'success'
  );
}

function extractAccessKey(
  responseData: EasebuzzInitiateSuccessResponse,
): string | null {
  if (
    !isEasebuzzSuccessStatus(
      responseData?.status,
    )
  ) {
    return null;
  }

  const accessKey =
    typeof responseData?.data === 'string'
      ? responseData.data
      : responseData?.data?.access_key ||
      responseData?.data?.accessKey ||
      responseData?.access_key ||
      responseData?.accessKey ||
      null;

  if (
    typeof accessKey !== 'string' ||
    !accessKey.trim()
  ) {
    return null;
  }

  const cleanedAccessKey =
    accessKey.trim();

  /*
   * Prevent provider error messages from being accepted
   * as access keys.
   */
  const knownErrorMessages = [
    'parameter validation failed',
    'invalid hash',
    'invalid key',
    'authentication failed',
    'transaction failed',
  ];

  if (
    knownErrorMessages.some((message) =>
      cleanedAccessKey
        .toLowerCase()
        .includes(message),
    )
  ) {
    return null;
  }

  return cleanedAccessKey;
}

export async function initiateEasebuzzIframePayment(
  input: InitiateEasebuzzPaymentInput,
) {
  const key = getEasebuzzKey();
  const salt = getEasebuzzSalt();
  const initiateUrl = getInitiateUrl();

  const txnid =
    cleanTransactionId(input.txnid);

  const amount =
    formatAmount(input.amount);

  const productinfo =
    cleanProductInfo(
      input.productinfo,
    );

  const firstname =
    cleanCustomerName(
      input.firstname,
    );

  const phone =
    cleanPhone(input.phone);

  const email =
    cleanEmail(input.email);

  const surl =
    cleanUrl(
      input.surl,
      'Easebuzz success URL',
    );

  const furl =
    cleanUrl(
      input.furl,
      'Easebuzz failure URL',
    );

  const udf1 =
    cleanUdf(input.udf1);

  const udf2 =
    cleanUdf(input.udf2);

  const udf3 =
    cleanUdf(input.udf3);

  const udf4 =
    cleanUdf(input.udf4);

  const udf5 =
    cleanUdf(input.udf5);

  const udf6 =
    cleanUdf(input.udf6);

  const udf7 =
    cleanUdf(input.udf7);

  const hash =
    buildPlIframeHash({
      key,
      txnid,
      amount,
      productinfo,
      firstname,
      email,

      udf1,
      udf2,
      udf3,
      udf4,
      udf5,
      udf6,
      udf7,

      salt,
    });

  const requestBody =
    new URLSearchParams();

  requestBody.append('key', key);
  requestBody.append('txnid', txnid);
  requestBody.append('amount', amount);
  requestBody.append(
    'productinfo',
    productinfo,
  );
  requestBody.append(
    'firstname',
    firstname,
  );
  requestBody.append('phone', phone);
  requestBody.append('email', email);
  requestBody.append('surl', surl);
  requestBody.append('furl', furl);
  requestBody.append('hash', hash);

  requestBody.append('udf1', udf1);
  requestBody.append('udf2', udf2);
  requestBody.append('udf3', udf3);
  requestBody.append('udf4', udf4);
  requestBody.append('udf5', udf5);
  requestBody.append('udf6', udf6);
  requestBody.append('udf7', udf7);

  if (input.address1) {
    requestBody.append(
      'address1',
      cleanOptionalText(
        input.address1,
        100,
      ),
    );
  }

  if (input.address2) {
    requestBody.append(
      'address2',
      cleanOptionalText(
        input.address2,
        100,
      ),
    );
  }

  if (input.city) {
    requestBody.append(
      'city',
      cleanOptionalText(
        input.city,
        50,
      ),
    );
  }

  if (input.state) {
    requestBody.append(
      'state',
      cleanOptionalText(
        input.state,
        50,
      ),
    );
  }

  if (input.country) {
    requestBody.append(
      'country',
      cleanOptionalText(
        input.country,
        50,
      ),
    );
  }

  if (input.zipcode) {
    const zipcode =
      String(input.zipcode)
        .replace(/\D/g, '')
        .slice(0, 6);

    requestBody.append(
      'zipcode',
      zipcode,
    );
  }

  if (input.uniqueId) {
    const uniqueId =
      String(input.uniqueId)
        .replace(
          /[^a-zA-Z0-9_]/g,
          '',
        )
        .slice(0, 40);

    if (uniqueId) {
      requestBody.append(
        'unique_id',
        uniqueId,
      );
    }
  }

  const safeRequestLog = {
    initiateUrl,
    key: key ? 'REDACTED' : undefined,
    txnid,
    amount,
    productinfo,
    firstname: firstname ? 'REDACTED' : undefined,
    phone: phone ? 'REDACTED' : undefined,
    email: email ? 'REDACTED' : undefined,
    surl,
    furl,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    udf6,
    udf7,
    hash: 'HASH_GENERATED',
  };

  console.log(
    'PL Easebuzz iframe initiation request:',
    safeRequestLog,
  );

  try {
    const response =
      await axios.post(
        initiateUrl,
        requestBody.toString(),
        {
          timeout:
            PL_EASEBUZZ_TIMEOUT,

          headers: {
            Accept:
              'application/json',

            'Content-Type':
              'application/x-www-form-urlencoded',
          },

          validateStatus: () => true,
        },
      );

    const responseData:
      EasebuzzInitiateSuccessResponse =
      response.data;

    console.log(
      'PL Easebuzz iframe raw response:',
      {
        httpStatus:
          response.status,
        data: responseData,
      },
    );

    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      throw new BadGatewayException({
        success: false,

        message:
          responseData?.error_desc ||
          responseData?.message ||
          `Easebuzz returned HTTP ${response.status}.`,

        providerResponse:
          responseData,
      });
    }

    if (
      !isEasebuzzSuccessStatus(
        responseData?.status,
      )
    ) {
      const providerMessage =
        typeof responseData?.data ===
          'string'
          ? responseData.data
          : responseData?.error_desc ||
          responseData?.message ||
          'Easebuzz payment parameter validation failed.';

      throw new BadGatewayException({
        success: false,
        message: providerMessage,
        providerStatus:
          responseData?.status,
        providerResponse:
          responseData,
      });
    }

    const accessKey =
      extractAccessKey(
        responseData,
      );

    if (!accessKey) {
      throw new BadGatewayException({
        success: false,

        message:
          'Easebuzz returned a successful response without a valid access key.',

        providerResponse:
          responseData,
      });
    }

    return {
      success: true,

      accessKey,

      key,

      environment:
        getEasebuzzEnvironment(),

      txnid,

      amount:
        Number(amount),

      rawResponse:
        responseData,

      requestPayload: {
        ...safeRequestLog,
      },
    };
  } catch (error: any) {
    if (
      error instanceof
      BadGatewayException ||
      error instanceof
      BadRequestException
    ) {
      throw error;
    }

    const apiError =
      error?.response?.data ||
      null;

    console.error(
      'PL Easebuzz iframe API error:',
      {
        status:
          error?.response?.status,
        data:
          apiError,
        message:
          error?.message,
      },
    );

    throw new BadGatewayException({
      success: false,

      message:
        apiError?.error_desc ||
        apiError?.message ||
        error?.message ||
        'Easebuzz payment initiation failed.',

      providerResponse:
        apiError,
    });
  }
}

export function verifyEasebuzzWebhookHash(data: any): boolean {
  try {
    const key = getEasebuzzKey();
    const salt = getEasebuzzSalt();

    const txnid = data.txnid || '';
    // Use formatted amount for hash check to ensure exact string match (two decimals)
    const amountStr = typeof data.amount === 'number' ? data.amount.toFixed(2) : (data.amount || '');
    const productinfo = data.productinfo || '';
    const firstname = data.firstname || '';
    const email = data.email || '';
    const udf1 = data.udf1 || '';
    const udf2 = data.udf2 || '';
    const udf3 = data.udf3 || '';
    const udf4 = data.udf4 || '';
    const udf5 = data.udf5 || '';
    const udf6 = data.udf6 || '';
    const udf7 = data.udf7 || '';
    const udf8 = data.udf8 || '';
    const udf9 = data.udf9 || '';
    const udf10 = data.udf10 || '';
    const status = data.status || '';

    // The official Easebuzz reverse hash sequence:
    // salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
    let hashSequence = `${salt}|${status}|${udf10}|${udf9}|${udf8}|${udf7}|${udf6}|${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amountStr}|${txnid}|${key}`;

    if (data.additionalCharges) {
      hashSequence = `${data.additionalCharges}|${hashSequence}`;
    }

    const computedHash = createHash('sha512').update(hashSequence).digest('hex');

    return computedHash === data.hash;
  } catch (err) {
    return false;
  }
}