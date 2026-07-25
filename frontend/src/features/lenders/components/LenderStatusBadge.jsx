const STATUS_STYLES = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  HEALTHY: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',

  SUBMITTED: 'bg-blue-50 text-blue-700 ring-blue-600/20',

  DRAFT: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  DEGRADED: 'bg-amber-50 text-amber-700 ring-amber-600/20',

  REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',
  DOWN: 'bg-red-50 text-red-700 ring-red-600/20',

  INACTIVE: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  NOT_CONFIGURED:
    'bg-slate-100 text-slate-700 ring-slate-500/20',
};

function formatStatus(value) {
  if (!value) {
    return 'Not available';
  }

  return value
    .toLowerCase()
    .split('_')
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

export function LenderStatusBadge({ value }) {
  const className =
    STATUS_STYLES[value] ??
    'bg-slate-100 text-slate-700 ring-slate-500/20';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${className}`}
    >
      {formatStatus(value)}
    </span>
  );
}