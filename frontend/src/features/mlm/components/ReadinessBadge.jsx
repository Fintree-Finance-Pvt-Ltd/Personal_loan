import React from 'react';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';

export default function ReadinessBadge({ status }) {
  switch (status) {
    case 'READY':
      return (
        <div className="flex items-center space-x-1 text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200 w-max">
          <ShieldCheck size={14} />
          <span className="text-xs font-medium">Ready</span>
        </div>
      );
    case 'NOT_READY_LENDER':
      return (
        <div className="flex items-center space-x-1 text-red-700 bg-red-50 px-2 py-1 rounded border border-red-200 w-max">
          <ShieldX size={14} />
          <span className="text-xs font-medium">Lender Inactive</span>
        </div>
      );
    case 'NOT_READY_PRODUCT':
      return (
        <div className="flex items-center space-x-1 text-orange-700 bg-orange-50 px-2 py-1 rounded border border-orange-200 w-max">
          <ShieldAlert size={14} />
          <span className="text-xs font-medium">Product Inactive</span>
        </div>
      );
    case 'NOT_READY_STRATEGY':
      return (
        <div className="flex items-center space-x-1 text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-200 w-max">
          <ShieldAlert size={14} />
          <span className="text-xs font-medium">Strategy Inactive</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center space-x-1 text-gray-700 bg-gray-50 px-2 py-1 rounded border border-gray-200 w-max">
          <ShieldAlert size={14} />
          <span className="text-xs font-medium">Unknown</span>
        </div>
      );
  }
}
