// Resolves a backend-relative file path (e.g. "/uploads/customer-documents/...")
// into an absolute URL pointing at the backend, not the frontend's own origin.
//
// Static files (served via `express.static('/uploads', ...)` in main.ts) are
// mounted BEFORE the API's global "/api" prefix, so they live at the backend's
// root — but the frontend's own dev proxy (vite.config.js) and production
// routing only forward "/api/*" to the backend. A bare relative fileUrl used
// directly as an <a href>/<img src> therefore resolves against the frontend's
// own origin, which has no matching route for it and falls through to the
// SPA's default/login redirect instead of loading the file.
const backendOrigin = (() => {
  const raw = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  const withoutApiSuffix = raw.replace(/\/api\/*$/, '');
  try {
    return new URL(withoutApiSuffix, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
})();

export function resolveFileUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return `${backendOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
}
