const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

function getCustomerId() {
  try {
    const session = JSON.parse(sessionStorage.getItem('customerSession') || 'null');
    return session?.customerId ? String(session.customerId) : null;
  } catch {
    return null;
  }
}

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    credentials: 'include',
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }

  if (!response.ok) {
    throw new Error(result?.message || result?.error || result?.data?.message || `Request failed with status ${response.status}.`);
  }

  if (result?.success === false) {
    throw new Error(result?.message || result?.error || result?.data?.message || 'The request could not be completed.');
  }

  return result;
}

function encodeLan(lan) {
  const value = String(lan || '').trim();
  if (!value) throw new Error('LAN is required.');
  return encodeURIComponent(value);
}

function extractApiData(result) {
  return result?.data?.data || result?.data || result || null;
}

function withCustomerId(payload = {}) {
  const customerId = getCustomerId();
  if (!customerId) throw new Error('Customer session not found. Please log in again.');
  return { ...payload, customerId };
}

function customerIdQuery() {
  const customerId = getCustomerId();
  if (!customerId) throw new Error('Customer session not found. Please log in again.');
  return `customerId=${encodeURIComponent(customerId)}`;
}

export const getPostApprovalJourney = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/post-approval?${customerIdQuery()}`, { method: 'GET' });
  return extractApiData(response);
};

export const getLoanOffer = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/offer?${customerIdQuery()}`, { method: 'GET' });
  return extractApiData(response);
};

export const getOfferPricing = async (lan, tenureDays) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/offer/pricing?tenureDays=${tenureDays}&${customerIdQuery()}`, { method: 'GET' });
  return extractApiData(response);
};

export const acceptLoanOffer = async (lan, payload) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/offer/accept`, {
    method: 'POST',
    body: JSON.stringify(withCustomerId(payload)),
  });
  return extractApiData(response);
};

export const initiateDigilocker = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/digilocker/initiate`, {
    method: 'POST',
    body: JSON.stringify(withCustomerId()),
  });
  return extractApiData(response);
};

export const getDigilockerStatus = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/digilocker/status?${customerIdQuery()}`, { method: 'GET' });
  return extractApiData(response);
};

export const saveAddress = async (lan, payload) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/address`, {
    method: 'PATCH',
    body: JSON.stringify(withCustomerId(payload)),
  });
  return extractApiData(response);
};

export const verifyBankAccount = async (lan, payload) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/bank-accounts/verify`, {
    method: 'POST',
    body: JSON.stringify(withCustomerId(payload)),
  });
  return extractApiData(response);
};

export const generateKfs = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/kfs/generate`, {
    method: 'POST',
    body: JSON.stringify(withCustomerId()),
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
    body: JSON.stringify(withCustomerId(payload)),
  });
  return extractApiData(response);
};

export const initiateMandate = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/mandate/initiate`, {
    method: 'POST',
    body: JSON.stringify(withCustomerId()),
  });
  return extractApiData(response);
};

export const getMandateStatus = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/mandate/status?${customerIdQuery()}`, { method: 'GET' });
  return extractApiData(response);
};

export const initiateEsign = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/esign/initiate`, {
    method: 'POST',
    body: JSON.stringify(withCustomerId()),
  });
  return extractApiData(response);
};

export const getEsignStatus = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/esign/status?${customerIdQuery()}`, { method: 'GET' });
  return extractApiData(response);
};

export const requestDisbursal = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/disbursal/request`, {
    method: 'POST',
    body: JSON.stringify(withCustomerId()),
  });
  return extractApiData(response);
};

export const getDisbursalStatus = async (lan) => {
  const response = await apiRequest(`/customer/loans/${encodeLan(lan)}/disbursal/status?${customerIdQuery()}`, { method: 'GET' });
  return extractApiData(response);
};
