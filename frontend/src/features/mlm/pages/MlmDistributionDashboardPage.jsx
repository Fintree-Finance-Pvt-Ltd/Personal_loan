import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { mlmApi } from '../api/mlm.api';

export default function MlmDistributionDashboardPage() {
  const { versionId } = useParams();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mlmApi.getDistributionDashboard(versionId)
      .then(setRoutes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [versionId]);

  if (loading) return <div className="p-6">Loading dashboard...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Smooth Weighted Round Robin Distribution</h1>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lender</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocation %</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Weight</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocated Apps</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocated Amount</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {routes.length === 0 ? (
              <tr><td colSpan="7" className="px-6 py-4 text-center text-gray-500">No routes configured</td></tr>
            ) : (
              routes.map((r, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">{r.lenderName}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{r.productName}</td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">{r.allocationPercentage}</td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">{r.currentWeight}</td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">{r.allocatedApplicationCount}</td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">{r.allocatedAmount}</td>
                  <td className="px-6 py-4 text-center whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${r.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {r.isActive ? 'Yes' : 'No'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
