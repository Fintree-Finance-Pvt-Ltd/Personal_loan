import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { mlmApi } from '../api/mlm.api';
import { Badge, Button, PageHeader, Panel, Spinner, TableShell } from '../../../components/ui';
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

  if (!policy) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading policy…" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title={policy.name}
        description={`Code: ${policy.code} · Platform product ID: ${policy.platformProductId}`}
        actions={
          <div className="flex items-center gap-3">
            <Badge tone={policy.operationalStatus === 'ACTIVE' ? 'brand' : 'neutral'}>{policy.operationalStatus}</Badge>
            <Button onClick={handleCreateDraft}>
              <Plus size={15} /> Create draft version
            </Button>
          </div>
        }
      />

      <Panel title="Versions">
        <TableShell>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Version</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Status</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Method</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {policy.versions?.map((version) => (
              <tr key={version.id} className="hover:bg-neutral-50/70">
                <td className="font-numeric px-5 py-3.5 font-semibold text-ink">v{version.versionNumber}</td>
                <td className="px-5 py-3.5"><Badge tone="info">{version.status}</Badge></td>
                <td className="px-5 py-3.5 text-neutral-600">{version.allocationMethod}</td>
                <td className="space-x-3 px-5 py-3.5 text-right text-sm">
                  {version.status === 'DRAFT' && (
                    <>
                      <Link to={`/admin-master/mlm-policy-versions/${version.id}/edit?policyId=${policy.id}`} className="font-semibold text-info-600 hover:underline">Edit routes</Link>
                      <button onClick={() => handleAction('submit', version.id)} className="font-semibold text-brand-600 hover:underline">Submit</button>
                    </>
                  )}
                  {version.status === 'SUBMITTED' && (
                    <button onClick={() => handleAction('approve', version.id)} className="font-semibold text-accent-600 hover:underline">Approve</button>
                  )}
                  {version.status === 'APPROVED' && (
                    <button onClick={() => handleAction('activate', version.id)} className="font-bold text-brand-600 hover:underline">Activate</button>
                  )}
                  <button onClick={() => setSimulatingVersionId(version.id)} className="font-semibold text-caution-600 hover:underline">Simulate</button>
                  {version.status === 'ACTIVE' && (
                    <Link to={`/admin-master/mlm-policy-versions/distribution?versionId=${version.id}`} className="font-bold text-info-600 hover:underline">Dashboard</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>

      {simulatingVersionId && (
        <MlmSimulationPanel
          versionId={simulatingVersionId}
          onClose={() => setSimulatingVersionId(null)}
        />
      )}
    </div>
  );
}
