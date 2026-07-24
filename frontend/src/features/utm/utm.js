const STORAGE_KEY = 'plp_utm_params';

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
    result[key] = typeof value === 'string' && value.length > 0 ? value : null;
  }
  return result;
}

/**
 * Persist UTM parameters into sessionStorage.
 * SessionStorage is cleared when the tab is closed, which is appropriate
 * for marketing attribution tracking during a browsing session.
 */
export function persistUtmParams(params) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // sessionStorage may be unavailable (private browsing, quota, etc.)
  }
}

/**
 * Retrieve previously stored UTM parameters.
 * Returns an object with all UTM keys, each either a string value or null.
 * If nothing has been stored, returns an object with all null values.
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
 * Initialise UTM tracking: extract from current URL and persist.
 * Safe to call multiple times; only the first call stores values.
 */
let initialized = false;
export function initUtmTracking() {
  if (initialized) return;
  initialized = true;
  // Only extract from the current page URL
  const params = extractUtmFromUrl(window.location.search);
  persistUtmParams(params);
}

/**
 * Append UTM parameters as query string to a given URL or existing params.
 * Only non-null values are appended.
 */
export function appendUtmToParams(targetParams = {}) {
  const utm = getUtmParams();
  for (const key of UTM_PARAMS) {
    if (utm[key] !== null) {
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

