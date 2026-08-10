import axios from 'axios';
import * as crypto from 'crypto';

const PL_EASEBUZZ_BASE_URL =
  process.env.PL_EASEBUZZ_BASE_URL || 'https://dashboard.easebuzz.in';

const PL_EASEBUZZ_TIMEOUT = Number(
  process.env.PL_EASEBUZZ_TIMEOUT || 30000,
);

export const plEasyCollectClient = axios.create({
  baseURL: PL_EASEBUZZ_BASE_URL,
  timeout: PL_EASEBUZZ_TIMEOUT,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

export function generatePlMerchantTxn(customerId: number | string | bigint) {
  return `PL-${customerId}-${Date.now()}`;
}

export function buildPlEasyCollectHash(input: {
  key: string;
  merchantTxn: string;
  name: string;
  email: string;
  phone: string;
  amount: string;
  udf1: string;
  udf2: string;
  udf3: string;
  udf4: string;
  udf5: string;
  message: string;
  salt: string;
}) {
  const hashString = [
    input.key,
    input.merchantTxn,
    input.name,
    input.email,
    input.phone,
    input.amount,
    input.udf1,
    input.udf2,
    input.udf3,
    input.udf4,
    input.udf5,
    input.message,
    input.salt,
  ].join('|');

  return crypto
    .createHash('sha512')
    .update(hashString)
    .digest('hex');
}

export async function createPlEasyCollectLink(input: {
  customerId: number | string | bigint;
  customerCode?: string | null;
  customerName: string;
  mobile: string;
  email?: string | null;
  amount: number;
  purpose: string;
  merchantTxn?: string;
  expiryDate?: string;
}) {
  if (!input.customerId) {
    throw new Error('customerId is required');
  }

  if (!input.customerName) {
    throw new Error('customerName is required');
  }

  if (!input.mobile) {
    throw new Error('mobile is required');
  }

  if (!input.amount || input.amount <= 0) {
    throw new Error('amount is required');
  }

  const key = String(
    process.env.EASEBUZZ_WIRE_API_KEY || process.env.PL_EASEBUZZ_KEY || '',
  ).trim();

  const salt = String(
    process.env.EASEBUZZ_SALT || process.env.PL_EASEBUZZ_SALT || '',
  ).trim();

  if (!key) {
    throw new Error('Missing EASEBUZZ_WIRE_API_KEY or PL_EASEBUZZ_KEY');
  }

  if (!salt) {
    throw new Error('Missing EASEBUZZ_SALT or PL_EASEBUZZ_SALT');
  }

  const merchantTxn =
    input.merchantTxn || generatePlMerchantTxn(input.customerId);

  const name = String(input.customerName).trim();
  const phone = String(input.mobile).trim();
  const amount = Number(input.amount).toFixed(2);
  const email = String(
    input.email || 'noemail@fintreefinance.com',
  ).trim();

  const customerCode = input.customerCode || '';
  const message = `Payment for ${input.purpose}${customerCode ? ` - ${customerCode}` : ''}`;

  const udf1 = String(input.customerId);
  const udf2 = String(customerCode);
  const udf3 = String(input.purpose || 'EMI_REPAYMENT').trim().toUpperCase();
  const udf4 = String((input as any).lan || 'PL');
  const udf5 = String((input as any).installmentNumber || '');

  const payload: any = {
    key,
    name,
    phone,
    amount,
    email,
    merchant_txn: merchantTxn,
    message,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    operation: [
      {
        type: 'sms',
        template: 'Default sms template',
      },
    ],
  };

  if (input.expiryDate) {
    payload.expiry_date = input.expiryDate;
  }

  payload.hash = buildPlEasyCollectHash({
    key,
    merchantTxn: payload.merchant_txn,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    amount: payload.amount,
    udf1: payload.udf1,
    udf2: payload.udf2,
    udf3: payload.udf3,
    udf4: payload.udf4,
    udf5: payload.udf5,
    message: payload.message,
    salt,
  });

  try {
    console.log('PL EasyCollect request payload:', {
      ...payload,
      hash: payload.hash ? 'HASH_GENERATED' : undefined,
    });

    const createLinkPath =
      process.env.PL_EASYCOLLECT_CREATE_PATH ||
      process.env.EASYCOLLECT_CREATE_LINK_PATH ||
      '/easycollect/v1/create';

    console.log('PL EasyCollect final request URL:', {
      baseURL: PL_EASEBUZZ_BASE_URL,
      path: createLinkPath,
      finalURL: `${PL_EASEBUZZ_BASE_URL}${createLinkPath}`,
    });

    const response = await plEasyCollectClient.post(
      createLinkPath,
      payload,
    );

    return {
      success: Boolean(response?.data?.status),
      message:
        response?.data?.message ||
        'PL EasyCollect response received',
      data: response?.data?.data || null,
      raw: response?.data || null,
      merchantTxn,
      requestPayload: payload,
    };
  } catch (error: any) {
    const apiError = error?.response?.data || null;

    console.error('PL EasyCollect API error:', {
      status: error?.response?.status,
      data: apiError,
      message: error?.message,
    });

    throw new Error(
      apiError?.message ||
        apiError?.error ||
        error?.message ||
        'PL EasyCollect create link failed',
    );
  }
}

export function extractPlPaymentLink(responseData: any) {
  return (
    responseData?.data?.payment_url ||
    responseData?.data?.payment_link ||
    responseData?.data?.url ||
    responseData?.data?.short_url ||
    responseData?.raw?.data?.payment_url ||
    responseData?.raw?.data?.payment_link ||
    responseData?.raw?.data?.url ||
    responseData?.raw?.data?.short_url ||
    responseData?.payment_url ||
    responseData?.payment_link ||
    responseData?.url ||
    responseData?.short_url ||
    null
  );
}

export function extractPlEasebuzzId(responseData: any) {
  return (
    responseData?.data?.id ||
    responseData?.data?.easebuzzid ||
    responseData?.data?.payment_id ||
    responseData?.raw?.data?.id ||
    responseData?.raw?.data?.easebuzzid ||
    responseData?.raw?.data?.payment_id ||
    responseData?.id ||
    responseData?.easebuzzid ||
    responseData?.payment_id ||
    null
  );
}

export function normalizePlEasebuzzStatus(status: any) {
  const paymentStatus = String(status || '')
    .trim()
    .toLowerCase();

  if (
    [
      'success',
      'successful',
      'captured',
      'paid',
    ].includes(paymentStatus)
  ) {
    return 'SUCCESS';
  }

  if (
    ['failure', 'failed', 'error'].includes(
      paymentStatus,
    )
  ) {
    return 'FAILED';
  }

  if (
    ['pending', 'processing'].includes(
      paymentStatus,
    )
  ) {
    return 'PROCESSING';
  }

  return 'RECEIVED';
}

export function extractPlEasebuzzWebhookIds(body: any) {
  return {
    merchantTxn:
      body?.merchant_txn ||
      body?.txnid ||
      body?.referenceId ||
      null,

    easebuzzId:
      body?.easebuzzid ||
      body?.payment_id ||
      body?.transaction_id ||
      body?.easepayid ||
      null,
  };
}