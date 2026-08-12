const STATUS_STYLES = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ACKNOWLEDGED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  DISBURSED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  LENDER_APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',

  PENDING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  PROCESSING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  RETRY_PENDING: 'bg-amber-50 text-amber-700 ring-amber-600/20',

  FAILED: 'bg-red-50 text-red-700 ring-red-600/20',
  REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',
  LENDER_REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',

  NOT_STARTED: 'bg-slate-100 text-slate-700 ring-slate-500/20',
};

function formatStatus(value) {
  if (!value) return 'Not started';
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function StageStatusBadge({ value }) {
  const className = STATUS_STYLES[value] ?? 'bg-slate-100 text-slate-700 ring-slate-500/20';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${className}`}>
      {formatStatus(value)}
    </span>
  );
}
