// Shared formatters for the business dashboard — compact Indian-numbering currency
// (Cr/L/K) since raw rupee figures at portfolio scale are unreadable in a StatCard,
// plus the small set of presentation helpers the dashboard panels share.

export function formatCurrency(amount) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)} K`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

// Full, uncompressed rupee figure — for tooltips/title attributes where precision
// matters more than glanceability.
export function formatCurrencyFull(amount) {
  return `₹${(Number(amount) || 0).toLocaleString('en-IN')}`;
}

export function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatMonthLabel(key) {
  const [y, m] = String(key).split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

export function prettifyStatus(status) {
  return String(status)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
