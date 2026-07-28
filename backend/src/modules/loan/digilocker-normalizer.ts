export type NormalizedDigitapDetails = {
  transactionId: string | null;
  uniqueId: string | null;
  status: string;
  maskedAadhaar: string | null;
  aadhaarLastFour: string | null;
  name: string | null;
  gender: string | null;
  dateOfBirth: Date | null;
  careOf: string | null;
  permanentAddress: {
    addressLine1: string;
    addressLine2: string;
    landmark: string;
    locality: string;
    district: string;
    city: string;
    state: string;
    country: string;
    pincode: string;
    formattedAddress: string;
  } | null;
  imageBase64: string | null;
  pdfSource: string | null;
  xmlSource: string | null;
  providerResponse: any;
};

export function normalizeDigitapDetails(responseInput: any): NormalizedDigitapDetails {
  const model = responseInput?.model || responseInput?.data || responseInput || {};

  const address = model?.address && typeof model.address === 'object' ? model.address : {};

  const rawMasked = cleanNullableString(
    model?.maskedAdharNumber ||
    model?.maskedAadhaar ||
    model?.maskedAadharNumber ||
    model?.adharNumber ||
    model?.aadhaarNumber
  );

  const maskedAadhaar = rawMasked
    ? (rawMasked.length >= 4 ? `XXXXXXXX${rawMasked.slice(-4)}` : rawMasked)
    : null;

  const addressLine1 = joinUnique([address?.house, address?.street]);
  const addressLine2 = joinUnique([address?.landmark, address?.loc, address?.po]);
  const locality = cleanNullableString(address?.loc || address?.po) || '';
  const district = cleanNullableString(address?.dist) || '';
  const city = cleanNullableString(address?.vtc || address?.city || address?.dist) || '';
  const state = cleanNullableString(address?.state) || '';
  const country = cleanNullableString(address?.country) || 'India';
  const pincode = String(address?.pc || address?.pincode || '').replace(/\D/g, '').slice(0, 6);

  const formattedAddress = joinUnique([
    addressLine1,
    addressLine2,
    locality,
    address?.subdist,
    district,
    city,
    state,
    pincode ? `${country} - ${pincode}` : country,
  ]);

  const hasAddress = Boolean(
    addressLine1 || addressLine2 || locality || district || city || state || pincode
  );

  const status = normalizeDigitapStatus(model?.status || responseInput?.status);

  return {
    transactionId: cleanNullableString(responseInput?.transactionId || model?.transactionId),
    uniqueId: cleanNullableString(model?.uniqueId || responseInput?.uniqueId),
    status,
    maskedAadhaar,
    aadhaarLastFour: maskedAadhaar ? maskedAadhaar.replace(/\D/g, '').slice(-4) || null : null,
    name: cleanNullableString(model?.name),
    gender: normalizeGender(model?.gender),
    dateOfBirth: parseDigitapDate(model?.dob),
    careOf: cleanNullableString(model?.careOf || model?.careof),
    permanentAddress: hasAddress
      ? {
          addressLine1,
          addressLine2,
          landmark: cleanNullableString(address?.landmark) || '',
          locality,
          district,
          city,
          state,
          country,
          pincode,
          formattedAddress,
        }
      : null,
    imageBase64: cleanNullableString(model?.image || model?.photo || model?.imageBase64),
    pdfSource: cleanNullableString(model?.pdfLink || model?.pdf_url || responseInput?.pdfLink),
    xmlSource: cleanNullableString(model?.xmlLink || model?.xml_url || model?.link || responseInput?.link),
    providerResponse: sanitizeDigitapPayload(responseInput),
  };
}

export function normalizeDigitapStatus(statusInput: unknown): string {
  const status = String(statusInput || '').trim().toLowerCase();

  if (['s', 'success', 'successful', 'verified', 'completed'].includes(status)) {
    return 'VERIFIED';
  }

  if (['pending', 'initiated', 'processing', 'in_progress'].includes(status)) {
    return 'INITIATED';
  }

  if (['expired', 'session_expired'].includes(status)) {
    return 'EXPIRED';
  }

  if (['cancelled', 'canceled', 'denied'].includes(status)) {
    return 'CANCELLED';
  }

  if (['failure', 'failed', 'error'].includes(status)) {
    return 'FAILED';
  }

  return status ? status.toUpperCase() : 'UNKNOWN';
}

export function sanitizeDigitapPayload(payload: any): any {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const largeDataKeys = [
    'image',
    'photo',
    'imagebase64',
    'xmlresponse',
    'xmldata',
    'pdfdata',
    'pdflink',
    'xmllink',
    'link',
  ];

  const clone = Array.isArray(payload) ? [...payload] : { ...payload };

  for (const key of Object.keys(clone)) {
    const lowerKey = key.toLowerCase();
    const value = clone[key];

    if (largeDataKeys.includes(lowerKey)) {
      if (typeof value === 'string' && value.length > 30) {
        clone[key] = '[REMOVED]';
        continue;
      }
    }

    if (lowerKey.includes('adhar') || lowerKey.includes('aadhaar')) {
      if (typeof value === 'string') {
        const digitsOnly = value.replace(/\D/g, '');
        if (digitsOnly.length === 12 && !value.includes('X')) {
          clone[key] = `XXXXXXXX${digitsOnly.slice(-4)}`;
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      clone[key] = sanitizeDigitapPayload(value);
    }
  }

  return clone;
}

function normalizeGender(value: unknown): string | null {
  const gender = String(value || '').trim().toUpperCase();

  if (gender === 'M' || gender === 'MALE') {
    return 'MALE';
  }

  if (gender === 'F' || gender === 'FEMALE') {
    return 'FEMALE';
  }

  if (['T', 'O', 'OTHER'].includes(gender)) {
    return 'OTHER';
  }

  return gender || null;
}

function parseDigitapDate(value: unknown): Date | null {
  const text = String(value || '').trim();

  if (!text) {
    return null;
  }

  const ddMmYyyy = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (ddMmYyyy) {
    const [, day, month, year] = ddMmYyyy;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const yyyyMmDd = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (yyyyMmDd) {
    return new Date(`${text}T00:00:00.000Z`);
  }

  const parsedDate = new Date(text);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function cleanNullableString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function joinUnique(values: unknown[]): string {
  const seen = new Set<string>();

  return values
    .map(cleanNullableString)
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .join(', ');
}
