import React from 'react';
import ReadinessBadge from './ReadinessBadge';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

export default function DistributionTable({ distribution }) {
  if (!distribution || distribution.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-8 text-center">
        <p className="text-gray-500">No distribution routes found for the selected criteria.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Lender</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Product</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Readiness</th>
            <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Active</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider bg-blue-50/50">Target %</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider bg-green-50/50">Actual %</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Variance</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Current Weight</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Allocated Apps</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Amount</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {distribution.map((route) => {
            const isVariancePositive = route.variancePercentage > 0;
            const isVarianceNegative = route.variancePercentage < 0;

            return (
              <tr key={route.routeId} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{route.lenderName}</div>
                  <div className="text-xs text-gray-500">{route.lenderId}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-gray-900">{route.productName}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <ReadinessBadge status={route.readiness} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                    route.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {route.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-blue-700 bg-blue-50/30">
                  {route.targetPercentage}%
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-green-700 bg-green-50/30">
                  {route.actualApplicationPercentage.toFixed(2)}%
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end space-x-1">
                    {isVariancePositive && <ArrowUp size={14} className="text-orange-500" />}
                    {isVarianceNegative && <ArrowDown size={14} className="text-purple-500" />}
                    {!isVariancePositive && !isVarianceNegative && <Minus size={14} className="text-gray-400" />}
                    <span className={`font-medium ${isVariancePositive ? 'text-orange-600' : isVarianceNegative ? 'text-purple-600' : 'text-gray-500'}`}>
                      {Math.abs(route.variancePercentage).toFixed(2)}%
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-gray-600">
                  {route.currentWeight.toFixed(4)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900 font-medium">
                  {route.allocatedApplicationCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900 font-medium">
                  {formatCurrency(route.allocatedAmount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
