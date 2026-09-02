import { createHmac, timingSafeEqual } from 'crypto';

// VAPT C6: /uploads was served as a fully public, unauthenticated static directory
// (see main.ts), and PAN-card filenames are built from a sequential customerId + plain
// millisecond timestamp — near-zero entropy, guessable by anyone with no login at all.
// Rather than requiring every <img> consumer to attach an Authorization header (browsers
// don't do that for plain <img src>), documents are signed here, once, at the point an
// API response is about to hand a fileUrl to a client. main.ts's static handler then
// verifies exp/sig before ever touching the filesystem. Documents whose serializer
// hasn't been updated to call signDocumentUrl() simply fail closed (image doesn't load)
// rather than leaking — never the reverse.

function getSigningKey(): string {
  const key = process.env.DOCUMENT_URL_SIGNING_KEY;
  if (!key) {
    throw new Error('DOCUMENT_URL_SIGNING_KEY is not configured.');
  }
  return key;
}

function computeSignature(pathname: string, exp: number, key: string): string {
  return createHmac('sha256', key).update(`${pathname}:${exp}`).digest('hex');
}

/**
 * Signs a document URL/path (e.g. "/uploads/customer-documents/pan-card/2026/08/x.jpg")
 * with a short-lived expiry. Safe to call repeatedly — every API response that includes
 * a document gets a freshly signed, freshly expiring URL.
 *
 * The signed path is prefixed with the API prefix (/api/uploads/...) even though what's
 * stored in the DB (and passed in here) is bare uploads/... — production's reverse
 * proxy only forwards /api/* to this backend, so a signed URL without that prefix would
 * 403 correctly but never even reach this server; the browser would hit the frontend's
 * static hosting instead and get bounced to its login redirect. See main.ts's uploads
 * mount, which listens on this same prefixed path.
 */
export function signDocumentUrl(pathOrUrl: string | null | undefined, ttlSeconds = 600): string | null {
  if (!pathOrUrl) return pathOrUrl ?? null;
  // Only ever sign our own /uploads paths — never touch absolute/external URLs.
  if (!pathOrUrl.startsWith('/uploads/') && !pathOrUrl.startsWith('uploads/')) return pathOrUrl;

  const apiPrefix = process.env.API_PREFIX || 'api';
  const bare = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  const pathname = `/${apiPrefix}${bare}`;
  const key = getSigningKey();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = computeSignature(pathname, exp, key);
  return `${pathname}?exp=${exp}&sig=${sig}`;
}

export function verifyDocumentUrlSignature(pathname: string, exp: unknown, sig: unknown): boolean {
  if (typeof exp !== 'string' || typeof sig !== 'string' || !exp || !sig) return false;

  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;

  const key = getSigningKey();
  const expected = computeSignature(pathname, expNum, key);
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig);
  if (expectedBuf.length !== sigBuf.length) return false;
  return timingSafeEqual(expectedBuf, sigBuf);
}
