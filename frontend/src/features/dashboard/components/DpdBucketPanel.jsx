import { Badge, Panel } from '../../../components/ui';
import { formatCurrency, formatCurrencyFull, formatNumber } from '../utils/format';

// Bar color per bucket — deliberately escalating from neutral (not yet due) through
// caution (early delinquency) to danger (90+ DPD / NPA), matching the same semantic
// scale used for status badges elsewhere in the admin UI.
const BUCKET_STYLE = {
  CURRENT: { bar: 'bg-neutral-300', tone: 'neutral' },
  DPD_1_30: { bar: 'bg-caution-300', tone: 'caution' },
  DPD_31_60: { bar: 'bg-caution-500', tone: 'caution' },
  DPD_61_90: { bar: 'bg-danger-400', tone: 'danger' },
  DPD_90_PLUS: { bar: 'bg-danger-600', tone: 'danger' },
};

export function DpdBucketPanel({ dpdBuckets }) {
  const maxAmount = Math.max(...dpdBuckets.map((b) => b.amount), 1);

  return (
    <Panel
      title="Portfolio risk — DPD buckets"
      description="Days-past-due distribution across every open installment on a disbursed loan, computed live from due dates."
    >
      <div className="space-y-4">
        {dpdBuckets.map((bucket) => {
          const style = BUCKET_STYLE[bucket.bucket] || BUCKET_STYLE.CURRENT;
          const widthPct = Math.max((bucket.amount / maxAmount) * 100, bucket.amount > 0 ? 2 : 0);
          return (
            <div key={bucket.bucket}>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  {bucket.label}
                  {bucket.bucket === 'DPD_90_PLUS' && <Badge tone="danger">NPA</Badge>}
                </span>
                <span className="text-neutral-500">
                  <span className="font-numeric font-semibold text-ink">{formatNumber(bucket.count)}</span> installments · <span className="font-numeric font-semibold text-ink" title={formatCurrencyFull(bucket.amount)}>{formatCurrency(bucket.amount)}</span>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={`h-full rounded-full ${style.bar}`}
                  style={{ width: `${widthPct}%` }}
                  title={`${bucket.label}: ${formatCurrencyFull(bucket.amount)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
