import { Filter, RefreshCw } from 'lucide-react';

export default function DistributionFilters({ 
  platformProducts, 
  filters, 
  onChange, 
  onRefresh, 
  isLoading 
}) {
  return (
    <div className="bg-white p-4 rounded-lg shadow mb-6 border border-gray-200">
      <div className="flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center text-gray-500 font-medium">
          <Filter size={18} className="mr-2" />
          Filters
        </div>

        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Platform Product</label>
            <select 
              className="w-full text-sm border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 py-1.5"
              value={filters.platformProductId || ''}
              onChange={(e) => onChange('platformProductId', e.target.value)}
            >
              <option value="">Select Platform Product</option>
              {platformProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-gray-500 mb-1">Readiness</label>
            <select 
              className="w-full text-sm border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 py-1.5"
              value={filters.readiness || ''}
              onChange={(e) => onChange('readiness', e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="READY">Ready</option>
              <option value="NOT_READY_LENDER">Lender Inactive</option>
              <option value="NOT_READY_PRODUCT">Product Inactive</option>
              <option value="NOT_READY_STRATEGY">Strategy Inactive</option>
            </select>
          </div>
        </div>

        <button 
          onClick={onRefresh}
          disabled={isLoading}
          className="ml-auto flex items-center px-4 py-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors font-medium text-sm disabled:opacity-50"
        >
          <RefreshCw size={16} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    </div>
  );
}
