import { Badge } from '../../../components/ui';

const STATUS_TONES = {
  COMPLETED: 'brand',
  ACKNOWLEDGED: 'brand',
  APPROVED: 'brand',
  DISBURSED: 'brand',
  LENDER_APPROVED: 'brand',
  PAID: 'brand',
  FULLY_PAID: 'brand',

  PENDING: 'caution',
  PROCESSING: 'caution',
  RETRY_PENDING: 'caution',
  PARTIAL: 'caution',

  FAILED: 'danger',
  REJECTED: 'danger',
  LENDER_REJECTED: 'danger',

  NOT_STARTED: 'neutral',
  WAIVED: 'neutral',
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
  const tone = STATUS_TONES[value] ?? 'neutral';
  return (
    <Badge tone={tone} dot>
      {formatStatus(value)}
    </Badge>
  );
}
