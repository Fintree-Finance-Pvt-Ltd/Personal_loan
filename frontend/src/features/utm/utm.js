const STORAGE_KEY = 'plp_utm_params';
const ATTR_STORAGE_KEY = 'plp_acquisition_attribution';

export const ACQUISITION_SOURCES = {
  RM: 'RM',
  GOOGLE: 'GOOGLE',
  META: 'META',
  MARKETING: 'MARKETING',
  PARTNER: 'PARTNER',
  ORGANIC: 'ORGANIC',
  REFERRAL: 'REFERRAL',
  WEBSITE: 'WEBSITE',
  OTHER: 'OTHER',
};

const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

/**
 * Extract UTM parameters from a URL query string.
 * Returns an object with only non-empty string values.
 * Missing or empty params are set to null.
 */
export function extractUtmFromUrl(searchString) {
  const params = new URLSearchParams(searchString);
  const result = {};
  for (const key of UTM_PARAMS) {
    const value = params.get(key);
    result[key] = typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }
  return result;
}

/**
 * Resolves one of the 9 controlled acquisition sources from parameter maps.
 */
export function resolveAcquisitionSource(params = {}) {
  const rawSource = params.acquisition_source || params.source ? String(params.acquisition_source || params.source).trim().toUpperCase() : null;
  const utmSource = params.utm_source ? String(params.utm_source).trim().toLowerCase() : null;
  const utmMedium = params.utm_medium ? String(params.utm_medium).trim().toLowerCase() : null;
  const utmCampaign = params.utm_campaign ? String(params.utm_campaign).trim().toLowerCase() : null;
  const rmId = params.rm_id || params.rmId || params.rmCode || params.rm_code ? String(params.rm_id || params.rmId || params.rmCode || params.rm_code).trim() : null;
  const rmName = params.rm_name || params.rmName ? String(params.rm_name || params.rmName).trim() : null;
  const partnerCode = params.partner_code || params.partnerCode || params.dsaCode || params.dsa_code ? String(params.partner_code || params.partnerCode || params.dsaCode || params.dsa_code).trim() : null;
  const partnerName = params.partner_name || params.partnerName ? String(params.partner_name || params.partnerName).trim() : null;
  const referralCode = params.ref || params.referral_code || params.referralCode ? String(params.ref || params.referral_code || params.referralCode).trim() : null;
  const clickId = params.gclid || params.fbclid || params.click_id || params.clickId ? String(params.gclid || params.fbclid || params.click_id || params.clickId).trim().toLowerCase() : null;
  const referrer = params.referrer ? String(params.referrer).trim().toLowerCase() : '';

  if (rawSource === 'RM' || rmId || rmName || utmSource === 'rm' || utmMedium === 'rm') {
    return ACQUISITION_SOURCES.RM;
  }

  if (rawSource === 'PARTNER' || partnerCode || partnerName || utmSource === 'partner' || utmSource === 'dsa') {
    return ACQUISITION_SOURCES.PARTNER;
  }

  if (rawSource === 'REFERRAL' || referralCode || utmSource === 'referral' || utmMedium === 'referral') {
    return ACQUISITION_SOURCES.REFERRAL;
  }

  if (
    rawSource === 'GOOGLE' ||
    params.gclid ||
    clickId?.startsWith('gclid') ||
    utmSource === 'google' ||
    utmSource === 'googleads' ||
    utmSource === 'adwords' ||
    ((utmMedium === 'cpc' || utmMedium === 'ppc' || utmMedium === 'search') && referrer.includes('google'))
  ) {
    return ACQUISITION_SOURCES.GOOGLE;
  }

  if (
    rawSource === 'META' ||
    params.fbclid ||
    clickId?.startsWith('fbclid') ||
    utmSource === 'meta' ||
    utmSource === 'facebook' ||
    utmSource === 'instagram' ||
    utmSource === 'fb' ||
    utmSource === 'ig' ||
    ((utmMedium === 'paid_social' || utmMedium === 'social_paid') && (referrer.includes('facebook') || referrer.includes('instagram')))
  ) {
    return ACQUISITION_SOURCES.META;
  }

  if (rawSource && Object.values(ACQUISITION_SOURCES).includes(rawSource)) {
    return rawSource;
  }

  if (
    rawSource === 'MARKETING' ||
    utmCampaign ||
    utmSource ||
    (utmMedium && ['email', 'newsletter', 'sms', 'whatsapp', 'affiliate', 'display', 'banner', 'cpm'].includes(utmMedium))
  ) {
    return ACQUISITION_SOURCES.MARKETING;
  }

  if (
    rawSource === 'ORGANIC' ||
    utmMedium === 'organic' ||
    referrer.includes('google.') ||
    referrer.includes('bing.') ||
    referrer.includes('yahoo.') ||
    referrer.includes('duckduckgo.')
  ) {
    return ACQUISITION_SOURCES.ORGANIC;
  }

  if (rawSource === 'OTHER') {
    return ACQUISITION_SOURCES.OTHER;
  }

  return ACQUISITION_SOURCES.WEBSITE;
}

/**
 * Extract complete acquisition attribution parameters from the current URL and document.
 */
export function extractCompleteAttribution(searchString = (typeof window !== 'undefined' ? window.location?.search : '') || '', referrer = typeof document !== 'undefined' ? document.referrer : '') {
  const params = new URLSearchParams(searchString);
  const getVal = (key) => {
    const v = params.get(key);
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
  };

  const rawMap = {
    utm_source: getVal('utm_source'),
    utm_medium: getVal('utm_medium'),
    utm_campaign: getVal('utm_campaign'),
    utm_term: getVal('utm_term'),
    utm_content: getVal('utm_content'),
    rm_id: getVal('rm_id') || getVal('rmId') || getVal('rmCode') || getVal('rm_code'),
    rm_name: getVal('rm_name') || getVal('rmName'),
    partner_code: getVal('partner_code') || getVal('partnerCode') || getVal('dsa_code') || getVal('dsaCode'),
    partner_name: getVal('partner_name') || getVal('partnerName'),
    ref: getVal('ref') || getVal('referral_code') || getVal('referralCode'),
    gclid: getVal('gclid'),
    fbclid: getVal('fbclid'),
    acquisition_source: getVal('source') || getVal('acquisition_source'),
    referrer: referrer || null,
  };

  const acquisitionSource = resolveAcquisitionSource(rawMap);
  const clickId = rawMap.gclid ? `gclid_${rawMap.gclid}` : rawMap.fbclid ? `fbclid_${rawMap.fbclid}` : null;
  const landingPage = typeof window !== 'undefined' && window.location ? window.location.href.split('#')[0].slice(0, 500) : null;

  return {
    acquisitionSource,
    utmSource: rawMap.utm_source,
    utmMedium: rawMap.utm_medium,
    utmCampaign: rawMap.utm_campaign,
    utmTerm: rawMap.utm_term,
    utmContent: rawMap.utm_content,
    rmId: rawMap.rm_id,
    rmName: rawMap.rm_name,
    partnerCode: rawMap.partner_code,
    partnerName: rawMap.partner_name,
    referralCode: rawMap.ref,
    clickId,
    landingPage,
    referrer: rawMap.referrer ? String(rawMap.referrer).slice(0, 500) : null,
  };
}

/**
 * Persist UTM parameters into sessionStorage.
 */
export function persistUtmParams(params) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Persist complete attribution payload into sessionStorage.
 */
export function persistAttributionPayload(attribution) {
  try {
    sessionStorage.setItem(ATTR_STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Retrieve previously stored UTM parameters.
 */
export function getUtmParams() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...createEmptyUtm(), ...JSON.parse(raw) };
    }
  } catch {
    // ignore parse or access errors
  }
  return createEmptyUtm();
}

/**
 * Retrieve complete attribution payload.
 * Priority:
 * 1. If active URL has attribution query params, extract and update session storage.
 * 2. Otherwise read from session storage fallback.
 */
export function getAttributionPayload() {
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    const fresh = extractCompleteAttribution(window.location.search, document.referrer);
    if (
      fresh.acquisitionSource !== ACQUISITION_SOURCES.WEBSITE ||
      fresh.rmId ||
      fresh.partnerCode ||
      fresh.referralCode ||
      fresh.utmSource
    ) {
      persistAttributionPayload(fresh);
      return fresh;
    }
  }

  try {
    const raw = sessionStorage.getItem(ATTR_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore parse error
  }
  return extractCompleteAttribution();
}

/**
 * Initialise UTM and acquisition tracking: extract from current URL and persist.
 */
export function initUtmTracking() {
  if (typeof window === 'undefined') return;

  const utmParams = extractUtmFromUrl(window.location.search);
  const fullAttr = extractCompleteAttribution(window.location.search, document.referrer);

  const hasParams =
    window.location.search &&
    window.location.search.length > 1 &&
    (fullAttr.acquisitionSource !== ACQUISITION_SOURCES.WEBSITE ||
      fullAttr.rmId ||
      fullAttr.partnerCode ||
      fullAttr.referralCode ||
      fullAttr.utmSource);

  if (hasParams || !sessionStorage.getItem(ATTR_STORAGE_KEY)) {
    persistUtmParams(utmParams);
    persistAttributionPayload(fullAttr);
  }
}

/**
 * Append UTM parameters as query string to a given URL or existing params.
 */
export function appendUtmToParams(targetParams = {}) {
  const utm = getUtmParams();
  for (const key of UTM_PARAMS) {
    if (utm[key] !== null && utm[key] !== undefined) {
      targetParams[key] = utm[key];
    }
  }
  return targetParams;
}

function createEmptyUtm() {
  const result = {};
  for (const key of UTM_PARAMS) {
    result[key] = null;
  }
  return result;
}
