const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || '/api';

async function apiRequest(
  endpoint,
  options = {},
) {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
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

export async function getCustomerById(customerId) {
  if (!customerId) {
    throw new Error('Customer ID is required.');
  }

  const response = await fetch(
    `/api/customer/${encodeURIComponent(String(customerId))}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
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
      result?.message ||
        result?.error ||
        result?.data?.message ||
        'Unable to load customer details.',
    );
  }

  const customer =
    result?.data?.data ||
    result?.data ||
    result ||
    null;

  if (!customer?.id) {
    throw new Error(
      'Customer details were not found in the response.',
    );
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
  const response = await fetch(`${API_BASE_URL}/documents/customer-live-photo`, {
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

export const customerApi = {
  getCustomer(customerId) {
    return getCustomerById(customerId);
  },
  getCustomerById,
  updateBasicDetails,
  updateCustomerProfile,
  reverseGeocode,
  uploadLivePhotoDocument,
  getCustomerLivePhoto,
};


