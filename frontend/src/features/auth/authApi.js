function getFullApiUrl(endpoint) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const cleanBase = rawBaseUrl.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Keep OTP login and customer refresh on the same browser origin in local
  // development. Vite proxies /api to VITE_API_BASE_URL.
  if (import.meta.env.DEV) {
    return `/api${cleanEndpoint}`;
  }

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
    // Humanize generic rate limit message
    if (result?.error?.code === 'RATE_LIMITED' || result?.statusCode === 429) {
      return 'Too many requests. Please wait a moment before trying again.';
    }
    return message;
  }

  return fallbackMessage;
}

export const authApi = {
  sendMobileOtp({
    mobileNumber,
    consentGiven,
    consentText,
  }) {
    return apiRequest('/otp/mobile/send', {
      method: 'POST',

      body: JSON.stringify({
        mobileNumber,
        consentGiven,
        consentText,
      }),
    });
  },

  verifyMobileOtp({
    mobileNumber,
    otp,
  }) {
    return apiRequest('/otp/mobile/verify', {
      method: 'POST',

      body: JSON.stringify({
        mobileNumber,
        otp,
      }),
    });
  },

  sendEmailOtp({
    customerId,
    email,
  }) {
    return apiRequest('/otp/email/send', {
      method: 'POST',

      body: JSON.stringify({
        customerId:
          String(customerId),
        email,
      }),
    });
  },

  verifyEmailOtp({
    customerId,
    email,
    otp,
  }) {
    return apiRequest('/otp/email/verify', {
      method: 'POST',

      body: JSON.stringify({
        customerId:
          String(customerId),
        email,
        otp,
      }),
    });
  },
};
