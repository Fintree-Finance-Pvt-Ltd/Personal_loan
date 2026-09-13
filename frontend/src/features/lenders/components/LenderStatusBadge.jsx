import { Badge } from '../../../components/ui';

const STATUS_TONES = {
  ACTIVE: 'brand',
  APPROVED: 'brand',
  HEALTHY: 'brand',

  SUBMITTED: 'info',

  DRAFT: 'caution',
  DEGRADED: 'caution',

  REJECTED: 'danger',
  DOWN: 'danger',

  INACTIVE: 'neutral',
  NOT_CONFIGURED: 'neutral',
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
  const tone = STATUS_TONES[value] ?? 'neutral';

  return (
    <Badge tone={tone} dot>
      {formatStatus(value)}
    </Badge>
  );
}
