import { Filter, RefreshCw } from 'lucide-react';
import { Card, Button } from '../../../components/ui';

export default function DistributionFilters({
  platformProducts,
  filters,
  onChange,
  onRefresh,
  isLoading
}) {
  return (
    <Card className="mb-6">
      <div className="flex flex-col items-center gap-4 md:flex-row">
        <div className="flex items-center gap-1.5 font-semibold text-neutral-500">
          <Filter size={16} />
          Filters
        </div>

        <div className="grid w-full flex-1 grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-500">Platform product</label>
            <select
              className="w-full rounded-lg border border-neutral-300 bg-white py-2 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              value={filters.platformProductId || ''}
              onChange={(e) => onChange('platformProductId', e.target.value)}
            >
              <option value="">Select platform product</option>
              {platformProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-500">Readiness</label>
            <select
              className="w-full rounded-lg border border-neutral-300 bg-white py-2 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              value={filters.readiness || ''}
              onChange={(e) => onChange('readiness', e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="READY">Ready</option>
              <option value="NOT_READY_LENDER">Lender inactive</option>
              <option value="NOT_READY_PRODUCT">Product inactive</option>
              <option value="NOT_READY_STRATEGY">Strategy inactive</option>
            </select>
          </div>
        </div>

        <Button variant="secondary" onClick={onRefresh} disabled={isLoading} className="ml-auto shrink-0">
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>
    </Card>
  );
}
