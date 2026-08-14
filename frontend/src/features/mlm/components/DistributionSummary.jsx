import { Target, Users, Layers, Activity, Ban } from 'lucide-react';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

export default function DistributionSummary({ summary }) {
  if (!summary) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      <div className="bg-white p-4 rounded-lg shadow border border-gray-100 flex items-center">
        <div className="p-3 rounded-full bg-blue-50 text-blue-600 mr-4">
          <Target size={20} />
        </div>
        <div>
          <p className="text-sm text-gray-500 font-medium">Target Allocation</p>
          <p className="text-xl font-bold text-gray-900">{summary.totalTargetPercentage}%</p>
        </div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow border border-gray-100 flex items-center">
        <div className="p-3 rounded-full bg-green-50 text-green-600 mr-4">
          <Layers size={20} />
        </div>
        <div>
          <p className="text-sm text-gray-500 font-medium">Allocated Amount</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.totalAllocatedAmount)}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow border border-gray-100 flex items-center">
        <div className="p-3 rounded-full bg-purple-50 text-purple-600 mr-4">
          <Users size={20} />
        </div>
        <div>
          <p className="text-sm text-gray-500 font-medium">Allocated Apps</p>
          <p className="text-xl font-bold text-gray-900">{summary.totalAllocatedCount}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow border border-gray-100 flex items-center">
        <div className="p-3 rounded-full bg-emerald-50 text-emerald-600 mr-4">
          <Activity size={20} />
        </div>
        <div>
          <p className="text-sm text-gray-500 font-medium">Active Routes</p>
          <p className="text-xl font-bold text-gray-900">{summary.activeRoutesCount}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow border border-gray-100 flex items-center">
        <div className="p-3 rounded-full bg-red-50 text-red-600 mr-4">
          <Ban size={20} />
        </div>
        <div>
          <p className="text-sm text-gray-500 font-medium">Inactive Routes</p>
          <p className="text-xl font-bold text-gray-900">{summary.inactiveRoutesCount}</p>
        </div>
      </div>
    </div>
  );
}
