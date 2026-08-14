import { ArrowRight, Ban, CheckCircle } from 'lucide-react';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

export default function AllocationSequencePreview({ result }) {
  if (!result) return null;

  const { sequence, projectedSummary, excludedRoutes } = result;

  return (
    <div className="space-y-8">
      {/* Excluded Routes Notice */}
      {excludedRoutes && excludedRoutes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-red-800 font-semibold mb-2 flex items-center">
            <Ban size={16} className="mr-2" />
            Excluded Routes (Inactive or Not Ready)
          </h4>
          <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
            {excludedRoutes.map((er, idx) => (
              <li key={idx}>
                Lender: {er.lenderId} | Product: {er.productId} | Reason: {er.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Projected Summary */}
      <div>
        <h4 className="text-gray-900 font-semibold mb-3 flex items-center">
          <CheckCircle size={16} className="mr-2 text-green-600" />
          Projected Summary
        </h4>
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Route ID</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Apps Allocated</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Target %</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Actual %</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {projectedSummary?.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-900 font-medium">{s.routeId}</td>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right">{s.count}</td>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right">{formatCurrency(s.totalAmount)}</td>
                  <td className="px-4 py-2 text-sm text-blue-600 font-semibold text-right">{s.targetPercentage}%</td>
                  <td className="px-4 py-2 text-sm text-green-600 font-semibold text-right">{s.actualPercentage}%</td>
                  <td className={`px-4 py-2 text-sm font-semibold text-right ${s.variancePercentage > 0 ? 'text-orange-600' : s.variancePercentage < 0 ? 'text-purple-600' : 'text-gray-500'}`}>
                    {s.variancePercentage}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sequence Timeline */}
      <div>
        <h4 className="text-gray-900 font-semibold mb-3 flex items-center">
          <ArrowRight size={16} className="mr-2 text-blue-600" />
          Allocation Sequence Timeline
        </h4>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-64 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {sequence?.map((routeId, idx) => (
              <div 
                key={idx} 
                className={`flex items-center text-sm px-2 py-1 rounded shadow-sm border ${
                  routeId 
                    ? 'bg-white border-blue-200 text-blue-800' 
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <span className="text-xs font-mono text-gray-500 mr-2 bg-gray-100 px-1 rounded">#{idx + 1}</span>
                {routeId || 'NO_ELIGIBLE_ROUTE'}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
