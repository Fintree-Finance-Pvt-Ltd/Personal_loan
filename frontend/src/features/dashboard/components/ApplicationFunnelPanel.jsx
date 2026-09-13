import { GitBranch } from 'lucide-react';
import { Badge, Panel } from '../../../components/ui';
import { formatNumber, prettifyStatus } from '../utils/format';

// Fixed left-to-right order matching the real PlApplicationStatus lifecycle, so the
// funnel reads top-to-bottom as "how far did applications get" rather than in whatever
// order the DB happened to return groups in.
const FUNNEL_ORDER = [
  'DRAFT',
  'SUBMITTED',
  'ALLOCATION_PENDING',
  'LENDER_ALLOCATED',
  'LENDER_REVIEW',
  'LENDER_PRE_APPROVED',
  'PENDING_CREDIT_REVIEW',
  'LENDER_APPROVED',
  'ASSESSMENT_FEE_PAID',
  'LOAN_CLOSED',
  'LENDER_REJECTED',
  'PLATFORM_REJECTED',
];

const STATUS_TONE = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  ALLOCATION_PENDING: 'caution',
  LENDER_ALLOCATED: 'caution',
  LENDER_REVIEW: 'caution',
  LENDER_PRE_APPROVED: 'accent',
  PENDING_CREDIT_REVIEW: 'caution',
  LENDER_APPROVED: 'brand',
  ASSESSMENT_FEE_PAID: 'brand',
  LOAN_CLOSED: 'brand',
  LENDER_REJECTED: 'danger',
  PLATFORM_REJECTED: 'danger',
};

// Bar fill per status — same tone family as the badge, just resolved to a solid bar color
// instead of a badge's pale background, so the funnel doesn't read as a flat gray list.
const BAR_TONE = {
  neutral: 'bg-neutral-400',
  info: 'bg-info-500',
  caution: 'bg-caution-500',
  accent: 'bg-accent-500',
  brand: 'bg-brand-500',
  danger: 'bg-danger-500',
};

export function ApplicationFunnelPanel({ byStatus, total }) {
  const orderedKeys = [
    ...FUNNEL_ORDER.filter((key) => key in byStatus),
    ...Object.keys(byStatus).filter((key) => !FUNNEL_ORDER.includes(key)),
  ];
  const maxCount = Math.max(...Object.values(byStatus), 1);

  return (
    <Panel
      title={<span className="flex items-center gap-2"><GitBranch size={16} className="text-neutral-400" /> Application funnel</span>}
      description="Live application count by current status, across the full book."
    >
      <div className="space-y-3">
        {orderedKeys.map((status) => {
          const count = byStatus[status] || 0;
          const tone = STATUS_TONE[status] || 'neutral';
          const widthPct = Math.max((count / maxCount) * 100, count > 0 ? 2 : 0);
          return (
            <div key={status} className="flex items-center gap-3">
              <div className="w-44 shrink-0">
                <Badge tone={tone}>{prettifyStatus(status)}</Badge>
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <div className={`h-full rounded-full ${BAR_TONE[tone] || BAR_TONE.neutral}`} style={{ width: `${widthPct}%` }} />
              </div>
              <span className="font-numeric w-16 shrink-0 text-right text-sm font-semibold text-ink">{formatNumber(count)}</span>
            </div>
          );
        })}
        <p className="pt-1 text-xs text-neutral-500">{formatNumber(total)} applications total, across all statuses.</p>
      </div>
    </Panel>
  );
}
