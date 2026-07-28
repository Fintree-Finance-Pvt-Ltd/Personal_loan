import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { mlmApi } from '../api/mlm.api';
import { Plus } from 'lucide-react';

export default function MlmPoliciesPage() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mlmApi.getPolicies()
      .then(setPolicies)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">MLM Policies</h1>
        <Link to="/admin-master/mlm-policies/create" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center">
          <Plus className="w-4 h-4 mr-2" /> New Policy
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platform Product</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Versions</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan="5" className="px-6 py-4 text-center">Loading...</td></tr>
            ) : policies.length === 0 ? (
              <tr><td colSpan="5" className="px-6 py-4 text-center text-gray-500">No policies found</td></tr>
            ) : (
              (Array.isArray(policies) ? policies : []).map((policy) => (
                <tr key={policy.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">{policy.name}</td>
                  <td className="px-6 py-4">{policy.code}</td>
                  <td className="px-6 py-4">{policy.operationalStatus}</td>
                  <td className="px-6 py-4">{policy.platformProductId}</td>
                  <td className="px-6 py-4">{policy._count?.versions || 0}</td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/admin-master/mlm-policies/${policy.id}`} className="text-blue-600 hover:text-blue-900 font-medium">
                      View
                    </Link>
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
