import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui';
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
    <article className="flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-[0_4px_20px_rgba(16,42,46,0.06)]">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">
          {getInitials(displayName)}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold text-ink">
            {displayName}
          </h2>

          <p
            className="mt-1 truncate text-sm text-neutral-500"
            title={lender.legalName}
          >
            {lender.legalName}
          </p>

          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Lender code: {lender.code}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <LenderStatusBadge value={lender.approvalStatus} />
        <LenderStatusBadge value={lender.operationalStatus} />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-neutral-100 py-4">
        <div>
          <dt className="text-xs text-neutral-500">Products</dt>
          <dd className="mt-1 font-bold text-ink">
            {lender.productCount ?? 0}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-neutral-500">Allocation</dt>
          <dd className="mt-1 text-sm font-bold text-ink">
            {allocation}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-neutral-500">API health</dt>
          <dd className="mt-1">
            <LenderStatusBadge
              value={lender.integrationHealth}
            />
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-neutral-500">Support email</span>
          <span
            className="truncate font-medium text-neutral-700"
            title={lender.supportEmail}
          >
            {lender.supportEmail || 'Not configured'}
          </span>
        </div>

        <div className="flex justify-between gap-3">
          <span className="text-neutral-500">Last updated</span>
          <span className="text-right font-medium text-neutral-700">
            {formatUpdatedAt(lender.updatedAt)}
          </span>
        </div>
      </div>

      <Button as={Link} to={`/admin-master/lenders/${lender.id}`} variant="secondary" className="mt-5 w-full">
        View and manage <ArrowRight size={15} />
      </Button>
    </article>
  );
}