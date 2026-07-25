import { Link } from 'react-router-dom';
import { LenderStatusBadge } from './LenderStatusBadge';

function getInitials(name) {
  if (!name) {
    return 'LN';
  }

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

function formatUpdatedAt(value) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function LenderCard({ lender }) {
  const displayName =
    lender.displayName || lender.legalName || 'Unnamed lender';

  const allocation =
    lender.allocationPercentage === null ||
    lender.allocationPercentage === undefined
      ? 'Not configured'
      : `${lender.allocationPercentage}%`;

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">
          {getInitials(displayName)}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold text-ink">
            {displayName}
          </h2>

          <p
            className="mt-1 truncate text-sm text-slate-500"
            title={lender.legalName}
          >
            {lender.legalName}
          </p>

          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Lender code: {lender.code}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <LenderStatusBadge value={lender.approvalStatus} />
        <LenderStatusBadge value={lender.operationalStatus} />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-slate-100 py-4">
        <div>
          <dt className="text-xs text-slate-500">Products</dt>
          <dd className="mt-1 font-bold text-ink">
            {lender.productCount ?? 0}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-slate-500">Allocation</dt>
          <dd className="mt-1 text-sm font-bold text-ink">
            {allocation}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-slate-500">API health</dt>
          <dd className="mt-1">
            <LenderStatusBadge
              value={lender.integrationHealth}
            />
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Support email</span>
          <span
            className="truncate font-medium text-slate-700"
            title={lender.supportEmail}
          >
            {lender.supportEmail || 'Not configured'}
          </span>
        </div>

        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Last updated</span>
          <span className="text-right font-medium text-slate-700">
            {formatUpdatedAt(lender.updatedAt)}
          </span>
        </div>
      </div>

      <Link
        to={`/admin-master/lenders/${lender.id}`}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 transition hover:bg-slate-50"
      >
        View and manage
      </Link>
    </article>
  );
}