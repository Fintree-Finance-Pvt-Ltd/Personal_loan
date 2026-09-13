import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { platformPoliciesApi } from '../api/platform-policies.api';
import { Alert, Badge, Button, Card, PageHeader, Panel, Spinner, TableShell } from '../../../components/ui';
import PolicySimulationPanel from '../components/PolicySimulationPanel';

export default function PlatformPolicyDetailsPage() {
  const { policyId } = useParams();
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

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading policy…" />
      </div>
    );
  }

  if (error || !policy) {
    return <Alert>{error || 'Policy not found.'}</Alert>;
  }

  const latestVersion = policy.versions?.[0];

  return (
    <div>
      <PageHeader eyebrow="Configuration" title={policy.name} description={policy.code} />

      <Card className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1.5 flex items-center gap-3">
              <Badge tone={policy.operationalStatus === 'ACTIVE' ? 'brand' : 'neutral'}>
                {policy.operationalStatus}
              </Badge>
            </div>
            <p className="text-neutral-700">{policy.description}</p>
          </div>
          <div className="text-right">
            <p className="mb-2 text-sm text-neutral-500">To edit an active policy, create a new version.</p>
            <Button onClick={handleCreateVersion}>Clone new version</Button>
          </div>
        </div>
      </Card>

      <Panel title="Version history" className="mb-6">
        <TableShell>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Version</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Status</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Rules</th>
              <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-neutral-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {policy.versions?.map(v => (
              <tr key={v.id} className="hover:bg-neutral-50/70">
                <td className="font-numeric px-5 py-3.5 font-semibold text-ink">v{v.versionNumber}</td>
                <td className="px-5 py-3.5">
                  <Badge tone="info">{v.status}</Badge>
                </td>
                <td className="px-5 py-3.5 text-neutral-600">{v.rules?.length || 0} configured rules</td>
                <td className="space-x-2 px-5 py-3.5 text-right">
                  {(v.status === 'DRAFT' || v.status === 'REJECTED') && (
                    <>
                      <Button as={Link} to={`/admin-master/platform-policies/${policy.id}/versions/${v.id}/edit`} variant="secondary" size="sm">
                        <Pencil size={13} /> Edit rules
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => handleSubmitVersion(v)}>Submit</Button>
                    </>
                  )}
                  {v.status === 'SUBMITTED' && (
                    <>
                      <Button variant="primary" size="sm" onClick={() => handleApproveVersion(v)}>Approve</Button>
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
        </TableShell>
      </Panel>

      {latestVersion && (
        <PolicySimulationPanel versionId={latestVersion.id} rules={latestVersion.rules || []} />
      )}
    </div>
  );
}
