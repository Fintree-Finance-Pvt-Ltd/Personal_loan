import { getCustomerApiBaseUrl, doCustomerRefresh, getCustomerAccessToken } from './customerApi';

function getFullApiUrl(endpoint) {
  const cleanBase = getCustomerApiBaseUrl().replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (cleanEndpoint.startsWith('/api/')) {
    if (cleanBase.endsWith('/api')) {
      return `${cleanBase.slice(0, -4)}${cleanEndpoint}`;
    }
    return `${cleanBase}${cleanEndpoint}`;
  }

  if (cleanBase.endsWith('/api')) {
    return `${cleanBase}${cleanEndpoint}`;
  }

  return `${cleanBase}/api${cleanEndpoint}`;
}

async function apiRequest(endpoint, options = {}) {
  const url = getFullApiUrl(endpoint);
  const send = (token) => fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  let response = await send(getCustomerAccessToken());
  if (response.status === 401) {
    const refreshedToken = await doCustomerRefresh();
    response = await send(refreshedToken);
  }

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }

  if (!response.ok) {
    throw new Error(result?.message || result?.error?.message || result?.data?.message || `Request failed with status ${response.status}.`);
  }

  if (result?.success === false) {
    throw new Error(result?.message || result?.error?.message || result?.data?.message || 'The request could not be completed.');
  }

  return result;
}

// For protected document endpoints (PDF preview/download) that can't be reached via a plain
// <a href>/<iframe src> — those are raw browser navigations and can't carry the Authorization
// header, so the backend's customer auth guard always rejects them. Fetch with the header
// like every other API call, then hand back a blob: URL the DOM element can point at.
// Caller is responsible for URL.revokeObjectURL(...) once the blob URL is no longer shown.
export async function fetchAuthenticatedBlobUrl(endpoint) {
  const url = getFullApiUrl(endpoint);
  const send = (token) => fetch(url, {
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let response = await send(getCustomerAccessToken());
  if (response.status === 401) {
    const refreshedToken = await doCustomerRefresh();
    response = await send(refreshedToken);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const errJson = await response.json();
      message = errJson?.message || errJson?.error?.message || message;
    } catch {
      // response body wasn't JSON (e.g. an HTML error page) — keep the generic message
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function encodeLan(lan) {
  const value = String(lan || '').trim();
  if (!value) throw new Error('LAN is required.');
  return encodeURIComponent(value);
}

function extractApiData(result) {
  return result?.data?.data || result?.data || result || null;
}

export const getPostApprovalJourney = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/post-approval`, { method: 'GET' });
  return extractApiData(response);
};

export const getLoanOffer = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/offer`, { method: 'GET' });
  return extractApiData(response);
};

export const getOfferPricing = async (lan, tenureDays) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/offer/pricing?tenureDays=${tenureDays}`, { method: 'GET' });
  return extractApiData(response);
};

export const acceptLoanOffer = async (lan, payload) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/offer/accept`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return extractApiData(response);
};

export const getPreApprovalOffer = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/pre-approval-offer`, { method: 'GET' });
  return extractApiData(response);
};

export const selectPreApprovalOffer = async (lan, payload) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/pre-approval-offer/select`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return extractApiData(response);
};

export const initiateDigilocker = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/digilocker/initiate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return extractApiData(response);
};

export const getDigilockerStatus = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/digilocker/status`, { method: 'GET' });
  return extractApiData(response);
};

export const fetchDigilockerDetails = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/digilocker/fetch-details`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return extractApiData(response);
};

export const saveAddress = async (lan, payload) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/address`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return extractApiData(response);
};

export const verifyBankAccount = async (lan, payload) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/bank-accounts/verify`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return extractApiData(response);
};

export const getPreviousBankDetails = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/bank-account/previous`, { method: 'GET' });
  return extractApiData(response);
};

export const generateKfs = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/kfs/generate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return extractApiData(response);
};

export const getKfs = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/kfs`, { method: 'GET' });
  return extractApiData(response);
};

export const acceptKfs = async (lan, payload) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/kfs/accept`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return extractApiData(response);
};

export const initiateMandate = async (lan, forceNew = false, mandateType = 'ENACH') => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/mandate/initiate`, {
    method: 'POST',
    body: JSON.stringify({ forceNew, mandateType }),
  });
  return extractApiData(response);
};

export const getMandateStatus = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/mandate/status`, { method: 'GET' });
  return extractApiData(response);
};

export const refreshMandateStatus = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/mandate/refresh-status`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return extractApiData(response);
};

export const initiateEsign = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/electronic-sign/prepare`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return extractApiData(response);
};

export const getEsignStatus = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/electronic-sign/status`, { method: 'GET' });
  return extractApiData(response);
};

export const prepareElectronicSign = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/electronic-sign/prepare`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return extractApiData(response);
};

export const markDocumentViewed = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/electronic-sign/document/viewed`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return extractApiData(response);
};

export const sendSigningOtp = async (lan, consentAccepted) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/electronic-sign/otp/send`, {
    method: 'POST',
    body: JSON.stringify({ consentAccepted }),
  });
  return extractApiData(response);
};

export const verifySigningOtp = async (lan, otpSessionId, otp) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/electronic-sign/otp/verify`, {
    method: 'POST',
    body: JSON.stringify({ otpSessionId, otp }),
  });
  return extractApiData(response);
};

export const getElectronicSignStatus = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/electronic-sign/status`, { method: 'GET' });
  return extractApiData(response);
};

export const requestDisbursal = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/disbursal/request`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return extractApiData(response);
};

export const getDisbursalStatus = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/disbursal/status`, { method: 'GET' });
  return extractApiData(response);
};

export const getCustomerLoanDetails = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/details`, { method: 'GET' });
  return extractApiData(response);
};

export const getCustomerLoans = async () => {
  const response = await apiRequest('/customer/loans', { method: 'GET' });
  return extractApiData(response);
};

export const initiateRepaymentPayment = async (lan, payload) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/repay/initiate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return extractApiData(response);
};

export const confirmRepayment = async (lan, payload) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/repay/confirm`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return extractApiData(response);
};



