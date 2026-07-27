import { Badge } from '../../../components/ui';

export function ProductStatusBadge({ status }) {
  if (!status) return null;
  switch (status) {
    case 'ACTIVE':
      return <Badge tone="brand">Active</Badge>;
    case 'INACTIVE':
      return <Badge tone="neutral">Inactive</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export function ProductVersionStatusBadge({ status }) {
  if (!status) return null;
  switch (status) {
    case 'DRAFT':
      return <Badge tone="neutral">Draft</Badge>;
    case 'SUBMITTED':
      return <Badge tone="warning">Submitted</Badge>;
    case 'APPROVED':
      return <Badge tone="success">Approved</Badge>;
    case 'REJECTED':
      return <Badge tone="critical">Rejected</Badge>;
    case 'ACTIVE':
      return <Badge tone="brand">Active</Badge>;
    case 'SUPERSEDED':
      return <Badge tone="neutral">Superseded</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}
