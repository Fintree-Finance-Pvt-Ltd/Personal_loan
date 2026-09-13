import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';

export default function ReadinessBadge({ status }) {
  switch (status) {
    case 'READY':
      return (
        <div className="flex items-center space-x-1 text-brand-700 bg-brand-50 px-2 py-1 rounded border border-brand-200 w-max">
          <ShieldCheck size={14} />
          <span className="text-xs font-medium">Ready</span>
        </div>
      );
    case 'NOT_READY_LENDER':
      return (
        <div className="flex items-center space-x-1 text-danger-700 bg-danger-50 px-2 py-1 rounded border border-danger-200 w-max">
          <ShieldX size={14} />
          <span className="text-xs font-medium">Lender Inactive</span>
        </div>
      );
    case 'NOT_READY_PRODUCT':
      return (
        <div className="flex items-center space-x-1 text-caution-700 bg-caution-50 px-2 py-1 rounded border border-caution-200 w-max">
          <ShieldAlert size={14} />
          <span className="text-xs font-medium">Product Inactive</span>
        </div>
      );
    case 'NOT_READY_STRATEGY':
      return (
        <div className="flex items-center space-x-1 text-accent-700 bg-accent-50 px-2 py-1 rounded border border-accent-200 w-max">
          <ShieldAlert size={14} />
          <span className="text-xs font-medium">Strategy Inactive</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center space-x-1 text-neutral-700 bg-neutral-50 px-2 py-1 rounded border border-neutral-200 w-max">
          <ShieldAlert size={14} />
          <span className="text-xs font-medium">Unknown</span>
        </div>
      );
  }
}
