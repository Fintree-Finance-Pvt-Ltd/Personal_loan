function getFullApiUrl(endpoint) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const cleanBase = rawBaseUrl.replace(/\/+$/, '');
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

async function apiRequest(
  endpoint,
  options = {},
) {
  const url = getFullApiUrl(endpoint);
  const response = await fetch(
    url,
    {
      credentials: 'include',

      ...options,

      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(localStorage.getItem('customerAccessToken') ? { Authorization: `Bearer ${localStorage.getItem('customerAccessToken')}` } : {}),
        ...(options.headers || {}),
      },
    },
  );

  let result = null;

  try {
    result = await response.json();
  } catch {
    result = null;
  }

  if (response.status === 401) {
    localStorage.removeItem('customerAccessToken');
    localStorage.removeItem('customerSession');
    window.location.href = '/customer/sign-in';
    throw new Error('Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    throw new Error(
      extractApiMessage(
        result,
        `Request failed with status ${response.status}.`,
      ),
    );
  }

  if (result?.success === false) {
    throw new Error(
      extractApiMessage(

        result,
        'The request could not be completed.',
      ),
    );
  }

  return result;
}

function extractApiMessage(
  result,
  fallbackMessage,
) {
  const message =
    result?.message ||
    result?.error?.message ||
    result?.error ||
    result?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  if (typeof message === 'string') {
    return message;
  }

  return fallbackMessage;
}

export async function getCustomerMe() {
  const result = await apiRequest(`/customer/me`, {
    method: 'GET',
  });
  return result?.data?.data || result?.data || result;
}

export async function getCustomerById(customerId) {
  if (!customerId) {
    throw new Error('Customer ID is required.');
  }

  const result = await apiRequest(`/customer/${encodeURIComponent(String(customerId))}`, {
    method: 'GET',
  });

  const customer = result?.data?.data || result?.data || result;
  if (!customer?.id) {
    throw new Error('Customer details were not found in the response.');
  }
  return customer;
}

export async function updateCustomerProfile(customerId, profileData) {
  if (!customerId) throw new Error('Customer ID is required.');

  const result = await apiRequest(`/customer/${encodeURIComponent(String(customerId))}/profile`, {
    method: 'PATCH',
    body: JSON.stringify(profileData),
  });

  return result?.data?.data || result?.data || result;
}

export async function reverseGeocode(latitude, longitude) {
  const result = await apiRequest('/external-api/reverse-geocode', {
    method: 'POST',
    body: JSON.stringify({ latitude, longitude }),
  });

  return result?.data?.data || result?.data || result;
}

export async function uploadLivePhotoDocument(formData) {
  const url = getFullApiUrl('/documents/customer-live-photo');
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }

  if (!response.ok) {
    throw new Error(
      result?.message || result?.error || result?.data?.message || 'Failed to upload live photo document.',
    );
  }

  return result?.data?.data || result?.data || result;
}

export async function getCustomerLivePhoto(customerId) {
  if (!customerId) return null;

  try {
    const result = await apiRequest(`/documents/customer/${encodeURIComponent(String(customerId))}/live-photo`, {
      method: 'GET',
    });

    return result?.data?.data || result?.data || null;
  } catch {
    return null;
  }
}

export async function updateBasicDetails(customerId, basicDetails) {
  if (!customerId) throw new Error('Customer ID is required.');

  const result = await apiRequest(`/customer/${encodeURIComponent(String(customerId))}/basic-details`, {
    method: 'PATCH',
    body: JSON.stringify(basicDetails),
  });

  return result?.data?.data || result?.data || result;
}

export async function resumeApplication(customerId, payload = {}) {
  const result = await apiRequest(`/customer/resume-application`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return result?.data?.data || result?.data || result;
}

export async function submitCustomerApplication(customerId, payload = {}) {
  if (!customerId) throw new Error('Customer ID is required.');

  const result = await apiRequest(`/customer/${encodeURIComponent(String(customerId))}/submit-application`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return result?.data?.data || result?.data || result;
}



function getCustomerSession() {
  try {
    return JSON.parse(localStorage.getItem('customerSession') || 'null');
  } catch {
    return null;
  }
}

export async function initiateCustomerAadhaarKyc(customerCode) {
  const session = getCustomerSession();
  const customerId = session?.customerId;
  const result = await apiRequest('/customer/aadhaar-kyc/digilocker/initiate', {
    method: 'POST',
    body: JSON.stringify({
      customerId,
      customerCode,
      consentGiven: true,
    }),
  });
  return result?.data?.data || result?.data || result;
}

export async function getCustomerAadhaarKycStatus() {
  const session = getCustomerSession();
  const customerId = session?.customerId;
  const query = customerId ? `?customerId=${encodeURIComponent(String(customerId))}` : '';
  const result = await apiRequest(`/customer/aadhaar-kyc/digilocker/status${query}`, {
    method: 'GET',
  });
  return result?.data?.data || result?.data || result;
}

export async function refreshCustomerAadhaarKycStatus() {
  const session = getCustomerSession();
  const customerId = session?.customerId;
  const result = await apiRequest('/customer/aadhaar-kyc/digilocker/refresh', {
    method: 'POST',
    body: JSON.stringify({
      customerId,
    }),
  });
  return result?.data?.data || result?.data || result;
}

export async function runEligibility(customerId) {
  const result = await apiRequest(`/customer/${customerId}/run-eligibility`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return result;
}

export async function updatePincode(customerId, body) {
  const result = await apiRequest(`/customer/${customerId}/pincode`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return result?.data?.data || result?.data || result;
}

export const customerApi = {
  getCustomer(customerId) {
    return getCustomerById(customerId);
  },
  getCustomerById,
  updateBasicDetails,
  updatePincode,
  updateCustomerProfile,
  submitCustomerApplication,
  reverseGeocode,
  uploadLivePhotoDocument,
  getCustomerLivePhoto,
  initiateCustomerAadhaarKyc,
  getCustomerAadhaarKycStatus,
  refreshCustomerAadhaarKycStatus,
  runEligibility,
};


