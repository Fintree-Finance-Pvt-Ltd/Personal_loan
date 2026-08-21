import axios from 'axios';

let memoryCustomerAccessToken = null;
let refreshPromise = null;
let refreshPromiseResetTimer = null;

function getApiErrorCode(error) {
  return (
    error?.response?.data?.error?.code ||
    error?.response?.data?.code ||
    null
  );
}

function clearCustomerSession() {
  setCustomerAccessToken(null);
  localStorage.removeItem('customerSession');
  sessionStorage.removeItem('customerSession');
}

function isCustomerRefreshRequest(config) {
  return String(config?.url || '').includes(
    '/customer/auth/refresh',
  );
}

export function shouldClearCustomerSession(error) {
  const status = error?.response?.status;
  const code = getApiErrorCode(error);

  return (
    status === 401 &&
    [
      'AUTH_REFRESH_INVALID',
      'CUSTOMER_AUTH_REQUIRED',
      'CUSTOMER_SESSION_INVALID',
      'NOT_AUTHENTICATED',
    ].includes(code)
  );
}

export function getCustomerApiBaseUrl(rawBaseUrl = import.meta.env.VITE_API_BASE_URL || '') {
  // In local development, use Vite's same-origin proxy so the HttpOnly
  // refresh cookie is not split between localhost and 127.0.0.1.
  if (import.meta.env.DEV) return '/api';

  const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, '');

  if (!cleanBaseUrl) return '/api';
  return cleanBaseUrl.endsWith('/api') ? cleanBaseUrl : `${cleanBaseUrl}/api`;
}

export const setCustomerAccessToken = (token) => {
  memoryCustomerAccessToken = token;
};
export const getCustomerAccessToken = () => memoryCustomerAccessToken;

const customerAxios = axios.create({
  baseURL: getCustomerApiBaseUrl(),
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export async function doCustomerRefresh() {
  if (!refreshPromise) {
    refreshPromise = customerAxios
      .post('/customer/auth/refresh', {}, { _retry: true })
      .then((res) => {
        const payload = res.data?.data?.data || res.data?.data || res.data || {};
        const { accessToken, customer } = payload;

        if (!accessToken) {
          throw new Error('The customer session could not be restored.');
        }

        setCustomerAccessToken(accessToken);
        if (customer) {
          localStorage.setItem('customerSession', JSON.stringify({
            customerId: customer.id || customer.customerId,
            mobileNumber: customer.mobileNumber,
          }));
        }
        return accessToken;
      });

    refreshPromise.then(
      () => {
        // React StrictMode and near-simultaneous protected requests can ask for
        // a refresh just after the first rotation completes. Reuse the result
        // briefly instead of rotating the same browser session again.
        window.clearTimeout(refreshPromiseResetTimer);
        refreshPromiseResetTimer = window.setTimeout(() => {
          refreshPromise = null;
          refreshPromiseResetTimer = null;
        }, 1000);
      },
      () => {
        refreshPromise = null;
      },
    );
  }
  return refreshPromise;
}

export async function doCustomerLogout() {
  try {
    await customerAxios.post('/customer/auth/logout');
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    setCustomerAccessToken(null);
    localStorage.removeItem('customerSession');
    sessionStorage.removeItem('customerSession');
  }
}

customerAxios.interceptors.request.use((config) => {
  if (memoryCustomerAccessToken) {
    if (config.headers.set) {
      config.headers.set('Authorization', `Bearer ${memoryCustomerAccessToken}`);
    } else {
      config.headers.Authorization = `Bearer ${memoryCustomerAccessToken}`;
    }
  }
  return config;
});

// customerAxios.interceptors.response.use(
//   (res) => res,
//   async (err) => {
//     const originalConfig = err.config;
//     if (err.response?.status === 401 && !originalConfig._retry) {
//       originalConfig._retry = true;
//       try {
//         const newToken = await doCustomerRefresh();
        
//         // Ensure the new token is applied to the retried request
//         if (originalConfig.headers.set) {
//           originalConfig.headers.set('Authorization', `Bearer ${newToken}`);
//         } else {
//           originalConfig.headers.Authorization = `Bearer ${newToken}`;
//         }
        
//         return await customerAxios(originalConfig);
//       } catch (e) {
//         setCustomerAccessToken(null);
//         localStorage.removeItem('customerSession');
//         sessionStorage.removeItem('customerSession');
//         window.location.href = '/customer/login';
//         return Promise.reject(e);
//       }
//     }
//     return Promise.reject(err);
//   }
// );

customerAxios.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalConfig =
      error?.config || {};

    const status =
      error?.response?.status;

    const errorCode =
      getApiErrorCode(error);

    const isRefreshRequest =
      isCustomerRefreshRequest(
        originalConfig,
      );

    if (
      status !== 401 ||
      originalConfig._retry ||
      isRefreshRequest
    ) {
      return Promise.reject(error);
    }

    /*
     * AUTH_REQUIRED belongs to the Admin JWT guard.
     * A customer route returning this indicates backend route
     * configuration is wrong. Refreshing the customer session
     * will not solve it.
     */
    if (errorCode === 'AUTH_REQUIRED') {
      console.error(
        'Customer endpoint was rejected by the Admin JWT guard:',
        originalConfig.url,
      );

      return Promise.reject(error);
    }

    originalConfig._retry = true;

    try {
      const newToken =
        await doCustomerRefresh();

      if (originalConfig.headers?.set) {
        originalConfig.headers.set(
          'Authorization',
          `Bearer ${newToken}`,
        );
      } else {
        originalConfig.headers = {
          ...(originalConfig.headers || {}),
          Authorization:
            `Bearer ${newToken}`,
        };
      }

      return await customerAxios(
        originalConfig,
      );
    } catch (refreshError) {
      /*
       * Do not log the customer out for:
       * - Network failure
       * - Backend 500/502/503
       * - Temporary timeout
       *
       * Clear the session only when the refresh token/session
       * is confirmed invalid.
       */
      if (
        shouldClearCustomerSession(
          refreshError,
        )
      ) {
        clearCustomerSession();

        window.location.replace(
          '/customer/login',
        );
      }

      return Promise.reject(
        refreshError,
      );
    }
  },
);

async function apiRequest(endpoint, options = {}) {
  try {
    const res = await customerAxios({
      url: endpoint,
      method: options.method || 'GET',
      data: options.body && typeof options.body === 'string' ? JSON.parse(options.body) : options.body,
      headers: options.headers,
    });
    return res.data;
  } catch (err) {
    const result = err.response?.data;
    const message = result?.message || result?.error?.message || result?.error || result?.data?.message || err.message || 'The request could not be completed.';
    if (Array.isArray(message)) throw new Error(message.join(', '));
    throw new Error(message);
  }
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

// Uses the customer-authenticated client (Authorization: Bearer <access token>, via
// customerAxios's interceptor) rather than authApi's plain fetch client — the backend
// now derives customerId from the verified session token, not from the request body
// (VAPT C3: this endpoint used to trust a client-supplied customerId with no session
// check at all, letting anyone hijack any account's email by guessing a numeric ID).
export async function sendEmailOtp(email) {
  const result = await apiRequest('/otp/email/send', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return result;
}

export async function verifyEmailOtp(email, otp) {
  const result = await apiRequest('/otp/email/verify', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
  return result;
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

export async function verifyCustomerPan(panNumber) {
  return apiRequest('/external-api/verify-pan', {
    method: 'POST',
    body: JSON.stringify({ panNumber }),
  });
}

export async function processPanOcr(fileOrData) {
  let body = fileOrData;
  let headers = {};

  if (fileOrData instanceof FormData) {
    body = fileOrData;
    headers = { 'Content-Type': 'multipart/form-data' };
  } else if (fileOrData instanceof File || fileOrData instanceof Blob) {
    const formData = new FormData();
    formData.append('file', fileOrData);
    body = formData;
    headers = { 'Content-Type': 'multipart/form-data' };
  } else if (typeof fileOrData === 'object' && fileOrData.file) {
    const formData = new FormData();
    formData.append('file', fileOrData.file);
    body = formData;
    headers = { 'Content-Type': 'multipart/form-data' };
  } else {
    body = JSON.stringify(fileOrData);
    headers = { 'Content-Type': 'application/json' };
  }

  const result = await apiRequest('/external-api/pan-ocr', {
    method: 'POST',
    body,
    headers,
  });

  return result?.data?.data || result?.data || result;
}

export async function verifyFaceLiveness(applicationId, inputImage) {
  return apiRequest('/external-api/face-liveness', {
    method: 'POST',
    body: JSON.stringify({ applicationId: String(applicationId), inputImage }),
  });
}

export async function initiateAssessmentPayment(payload) {
  return apiRequest('/external-api/initiate-payment', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getAssessmentPaymentStatus(paymentId, transactionId) {
  return apiRequest('/external-api/payment-status', {
    method: 'POST',
    body: JSON.stringify({
      paymentId,
      transactionId,
      purpose: 'ASSESSMENT_FEE',
    }),
  });
}

export async function saveApplicationAddress(payload) {
  return apiRequest('/customer/application/address', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function acceptLenderDecisionConsents() {
  const consents = [
    {
      consentType: 'BUREAU_ENQUIRY',
      consentTemplateId: 'BUREAU_ENQUIRY_V1',
      consentVersion: '1.0',
      consentText: 'I authorize a bureau enquiry for this loan application.',
    },
    {
      consentType: 'LENDER_CREDIT_ASSESSMENT',
      consentTemplateId: 'LENDER_CREDIT_ASSESSMENT_V1',
      consentVersion: '1.0',
      consentText: 'I authorize the allocated lender to assess my eligibility and credit profile.',
    },
    {
      consentType: 'LENDER_DECISION_REQUEST',
      consentTemplateId: 'LENDER_DECISION_REQUEST_V1',
      consentVersion: '1.0',
      consentText: 'I authorize submission of my completed application to the allocated lender for a lending decision.',
    },
  ];
  return apiRequest('/customer/application/decision-consents', {
    method: 'POST',
    body: JSON.stringify({ consents }),
  });
}

export async function uploadLivePhotoDocument(formData) {
  const result = await apiRequest('/documents/customer-live-photo', {
    method: 'POST',
    body: formData,
    headers: {
      // Axios will automatically set the correct Content-Type for FormData
      'Content-Type': 'multipart/form-data',
    },
  });

  return result?.data?.data || result?.data || result;
}

export async function getCustomerLivePhoto(customerId) {
  if (!customerId) return null;

  try {
    const result = await apiRequest('/documents/customer/live-photo', {
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

export async function saveCurrentAddressSameAsAadhaar() {
  const result = await apiRequest('/customer/aadhaar-kyc/digilocker/current-address/same-as-aadhaar', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return result?.data?.data || result?.data || result;
}

export async function initiateCustomerPayment(payload) {
  const result = await apiRequest('/external-api/initiate-payment', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result?.data?.data || result?.data || result;
}

export async function getCustomerPaymentStatus(payload) {
  const result = await apiRequest('/external-api/payment-status', {
    method: 'POST',
    body: JSON.stringify(payload),
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

export async function retryLenderSubmission(applicationId) {
  const result = await apiRequest('/customer/application/retry-lender-submission', {
    method: 'POST',
    body: JSON.stringify(applicationId ? { applicationId } : {}),
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

export async function initiateAccountAggregator(lan) {
  const response = await customerAxios.post(
    `/customer/loans/${encodeURIComponent(lan)}/account-aggregator/initiate`,
    {}
  );
  return response?.data?.data || response?.data || response;
}

export async function getAccountAggregatorStatus(lan) {
  const response = await customerAxios.get(
    `/customer/loans/${encodeURIComponent(lan)}/account-aggregator/status`
  );
  return response?.data?.data || response?.data || response;
}

export async function refreshAccountAggregatorStatus(lan) {
  const response = await customerAxios.post(
    `/customer/loans/${encodeURIComponent(lan)}/account-aggregator/refresh-status`,
    {}
  );
  return response?.data?.data || response?.data || response;
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
  verifyCustomerPan,
  verifyFaceLiveness,
  initiateAssessmentPayment,
  getAssessmentPaymentStatus,
  saveApplicationAddress,
  acceptLenderDecisionConsents,
  uploadLivePhotoDocument,
  getCustomerLivePhoto,
  initiateCustomerAadhaarKyc,
  getCustomerAadhaarKycStatus,
  refreshCustomerAadhaarKycStatus,
  runEligibility,
  retryLenderSubmission,
  initiateAccountAggregator,
  getAccountAggregatorStatus,
  refreshAccountAggregatorStatus,
};



