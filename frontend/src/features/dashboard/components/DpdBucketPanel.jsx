import { ShieldAlert } from 'lucide-react';
import { Badge, Panel } from '../../../components/ui';
import { formatCurrency, formatCurrencyFull, formatNumber, formatPercent } from '../utils/format';

// Bar color per bucket — deliberately escalating from neutral (not yet due) through
// caution (early delinquency) to danger (90+ DPD / NPA), matching the same semantic
// scale used for status badges elsewhere in the admin UI.
const BUCKET_STYLE = {
  CURRENT: { segment: 'bg-neutral-300', dot: 'bg-neutral-400' },
  DPD_1_30: { segment: 'bg-caution-300', dot: 'bg-caution-400' },
  DPD_31_60: { segment: 'bg-caution-500', dot: 'bg-caution-500' },
  DPD_61_90: { segment: 'bg-danger-400', dot: 'bg-danger-400' },
  DPD_90_PLUS: { segment: 'bg-danger-600', dot: 'bg-danger-600' },
};

// The standard NBFC/banking risk widget: one horizontal bar, segmented by DPD bucket and
// proportional to each bucket's share of the unpaid book, with a legend underneath giving
// the exact count/amount per segment — reads "at a glance" the way five separate bars
// asking to be visually compared side by side never quite does.
export function DpdBucketPanel({ dpdBuckets }) {
  const totalAmount = dpdBuckets.reduce((sum, b) => sum + b.amount, 0);
  const npaBucket = dpdBuckets.find((b) => b.bucket === 'DPD_90_PLUS');
  const npaShare = totalAmount > 0 ? (npaBucket?.amount || 0) / totalAmount : null;

  return (
    <Panel
      title={<span className="flex items-center gap-2"><ShieldAlert size={16} className="text-neutral-400" /> Portfolio risk — DPD buckets</span>}
      description="Days-past-due distribution across every open installment on a disbursed loan, computed live from due dates."
      actions={
        npaShare !== null && (
          <Badge tone={npaShare > 0.05 ? 'danger' : 'neutral'}>{formatPercent(npaShare)} of book is 90+ DPD</Badge>
        )
      }
    >
      {totalAmount === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">No open installments on the book yet.</p>
      ) : (
        <>
          <div className="flex h-9 w-full overflow-hidden rounded-lg border border-neutral-200">
            {dpdBuckets.map((bucket) => {
              const style = BUCKET_STYLE[bucket.bucket] || BUCKET_STYLE.CURRENT;
              const widthPct = (bucket.amount / totalAmount) * 100;
              if (widthPct <= 0) return null;
              return (
                <div
                  key={bucket.bucket}
                  className={`${style.segment} h-full first:rounded-l-lg last:rounded-r-lg`}
                  style={{ width: `${widthPct}%` }}
                  title={`${bucket.label}: ${formatCurrencyFull(bucket.amount)} (${formatPercent(widthPct / 100)})`}
                />
              );
            })}
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-5">
            {dpdBuckets.map((bucket) => {
              const style = BUCKET_STYLE[bucket.bucket] || BUCKET_STYLE.CURRENT;
              return (
                <div key={bucket.bucket}>
                  <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                    {bucket.label}
                  </dt>
                  <dd className="mt-1 font-numeric text-sm font-semibold text-ink" title={formatCurrencyFull(bucket.amount)}>
                    {formatCurrency(bucket.amount)}
                  </dd>
                  <dd className="text-xs text-neutral-500">{formatNumber(bucket.count)} installments</dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
    </Panel>
  );
}
