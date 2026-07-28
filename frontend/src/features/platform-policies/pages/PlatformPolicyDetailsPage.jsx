import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { platformPoliciesApi } from '../api/platform-policies.api';
import { Button } from '../../../components/ui';
import PolicySimulationPanel from '../components/PolicySimulationPanel';

export default function PlatformPolicyDetailsPage() {
  const { policyId } = useParams();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPolicy();
  }, [policyId]);

  const fetchPolicy = async () => {
    try {
      const data = await platformPoliciesApi.findOne(policyId);
      setPolicy(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    try {
      await platformPoliciesApi.createNewVersion(policyId);
      fetchPolicy();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to create version');
    }
  };

  const handleSubmitVersion = async (version) => {
    try {
      await platformPoliciesApi.submitVersion(version.id, version.version);
      fetchPolicy();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to submit version');
    }
  };

  const handleApproveVersion = async (version) => {
    try {
      await platformPoliciesApi.approveVersion(version.id, version.version);
      fetchPolicy();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to approve version');
    }
  };

  const handleActivateVersion = async (version) => {
    try {
      await platformPoliciesApi.activateVersion(version.id, version.version, new Date().toISOString());
      fetchPolicy();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to activate version');
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (error || !policy) return <div className="p-8 text-red-500">{error || 'Not found'}</div>;

  const latestVersion = policy.versions?.[0];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-gray-900">{policy.name}</h1>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${policy.operationalStatus === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
              {policy.operationalStatus}
            </span>
          </div>
          <p className="text-sm text-gray-500 font-mono">{policy.code}</p>
          <p className="mt-2 text-gray-700">{policy.description}</p>
        </div>
        <div>
          <Button onClick={handleCreateVersion}>Clone New Version</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Version History</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 font-medium">
            <tr>
              <th className="p-4">Version</th>
              <th className="p-4">Status</th>
              <th className="p-4">Rules</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {policy.versions?.map(v => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="p-4 font-medium">v{v.versionNumber}</td>
                <td className="p-4">
                  <span className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-full">{v.status}</span>
                </td>
                <td className="p-4">{v.rules?.length || 0} configured rules</td>
                <td className="p-4 text-right space-x-2">
                  {(v.status === 'DRAFT' || v.status === 'REJECTED') && (
                    <>
                      <Link to={`/admin-master/platform-policies/${policy.id}/versions/${v.id}/edit`}>
                        <Button variant="outline" size="sm">Edit Rules</Button>
                      </Link>
                      <Button variant="primary" size="sm" onClick={() => handleSubmitVersion(v)}>Submit</Button>
                    </>
                  )}
                  {v.status === 'SUBMITTED' && (
                    <>
                      <Button variant="success" size="sm" onClick={() => handleApproveVersion(v)}>Approve</Button>
                      <Button variant="danger" size="sm" onClick={() => alert('Reject not yet implemented in UI')}>Reject</Button>
                    </>
                  )}
                  {v.status === 'APPROVED' && (
                    <Button variant="primary" size="sm" onClick={() => handleActivateVersion(v)}>Activate</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {latestVersion && (
        <PolicySimulationPanel versionId={latestVersion.id} rules={latestVersion.rules || []} />
      )}
    </div>
  );
}
