import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { mlmApi } from '../api/mlm.api';
import MlmSimulationPanel from '../components/MlmSimulationPanel';

export default function MlmPolicyDetailsPage() {
  const { policyId } = useParams();
  const [policy, setPolicy] = useState(null);
  const [simulatingVersionId, setSimulatingVersionId] = useState(null);

  const loadPolicy = () => {
    mlmApi.getPolicyDetails(policyId).then(setPolicy).catch(console.error);
  };

  useEffect(() => {
    loadPolicy();
  }, [policyId]);

  const handleCreateDraft = async () => {
    try {
      await mlmApi.createPolicyVersion(policyId, {
        allocationMethod: 'WEIGHTED_FAIR_SHARE'
      });
      loadPolicy();
    } catch (err) {
      alert('Could not create draft: ' + (err.response?.data?.error?.message || err.message));
    }
  };

  const handleAction = async (action, versionId) => {
    try {
      if (action === 'submit') await mlmApi.submitPolicyVersion(versionId);
      if (action === 'approve') await mlmApi.approvePolicyVersion(versionId);
      if (action === 'activate') await mlmApi.activatePolicyVersion(versionId);
      loadPolicy();
    } catch (err) {
      alert('Action failed: ' + (err.response?.data?.error?.message || err.message));
    }
  };

  if (!policy) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">{policy.name}</h1>
          <p className="text-gray-500">Code: {policy.code} | Status: {policy.operationalStatus}</p>
          <p className="text-gray-500 mt-1">Platform Product ID: {policy.platformProductId}</p>
        </div>
        <button onClick={handleCreateDraft} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700">
          Create Draft Version
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 bg-gray-50 border-b font-bold text-gray-700">Versions</div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {policy.versions?.map((version) => (
              <tr key={version.id}>
                <td className="px-6 py-4">v{version.versionNumber}</td>
                <td className="px-6 py-4">{version.status}</td>
                <td className="px-6 py-4">{version.allocationMethod}</td>
                <td className="px-6 py-4 text-right space-x-2">
                  {version.status === 'DRAFT' && (
                    <>
                      <Link to={`/admin-master/mlm-policy-versions/${version.id}/edit?policyId=${policy.id}`} className="text-blue-600 hover:underline">Edit Routes</Link>
                      <button onClick={() => handleAction('submit', version.id)} className="text-green-600 hover:underline ml-2">Submit</button>
                    </>
                  )}
                  {version.status === 'SUBMITTED' && (
                    <button onClick={() => handleAction('approve', version.id)} className="text-purple-600 hover:underline ml-2">Approve</button>
                  )}
                  {version.status === 'APPROVED' && (
                    <button onClick={() => handleAction('activate', version.id)} className="text-green-600 hover:underline ml-2 font-bold">Activate</button>
                  )}
                  <button onClick={() => setSimulatingVersionId(version.id)} className="text-orange-600 hover:underline ml-2">Simulate</button>
                  {version.status === 'ACTIVE' && (
                    <Link to={`/admin-master/mlm-policy-versions/distribution?versionId=${version.id}`} className="text-blue-600 hover:underline font-bold ml-2">Dashboard</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {simulatingVersionId && (
        <MlmSimulationPanel 
          versionId={simulatingVersionId} 
          onClose={() => setSimulatingVersionId(null)} 
        />
      )}
    </div>
  );
}
