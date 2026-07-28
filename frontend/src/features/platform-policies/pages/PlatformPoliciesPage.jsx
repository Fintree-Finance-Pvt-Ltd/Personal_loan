import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { platformPoliciesApi } from '../api/platform-policies.api';
import { PlusIcon } from 'lucide-react';
import { Button } from '../../../components/ui';

export default function PlatformPoliciesPage() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      const data = await platformPoliciesApi.findAll();
      setPolicies(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8">Loading policies...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Policies</h1>
          <p className="text-gray-500 mt-1">Manage global eligibility rules for all applications.</p>
        </div>
        <Link to="/admin-master/platform-policies/new">
          <Button className="flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            Create Policy
          </Button>
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Code</th>
              <th className="p-4">Status</th>
              <th className="p-4">Latest Version</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-sm text-gray-700">
            {policies.map(policy => (
              <tr key={policy.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4 font-medium text-gray-900">
                  <Link to={`/admin-master/platform-policies/${policy.id}`} className="text-blue-600 hover:underline">
                    {policy.name}
                  </Link>
                </td>
                <td className="p-4">{policy.code}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${policy.operationalStatus === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                    {policy.operationalStatus}
                  </span>
                </td>
                <td className="p-4">
                  v{policy.versions?.[0]?.versionNumber || '-'} ({policy.versions?.[0]?.status || 'None'})
                </td>
              </tr>
            ))}
            {policies.length === 0 && (
              <tr>
                <td colSpan="4" className="p-8 text-center text-gray-500">
                  No policies found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
