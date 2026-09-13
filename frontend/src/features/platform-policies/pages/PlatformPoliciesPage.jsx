import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ShieldCheck } from 'lucide-react';
import { platformPoliciesApi } from '../api/platform-policies.api';
import { Badge, Button, EmptyState, PageHeader, Spinner, TableShell } from '../../../components/ui';

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

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Platform policies (BRE)"
        description="Manage global eligibility rules for all applications."
        actions={
          <Button as={Link} to="/admin-master/platform-policies/new">
            <Plus size={15} /> Create policy
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading policies…" />
        </div>
      ) : policies.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No policies found"
          description="Create a platform policy to define global eligibility rules."
        />
      ) : (
        <TableShell>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Name</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Code</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Status</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Latest version</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {policies.map(policy => (
              <tr key={policy.id} className="hover:bg-neutral-50/70">
                <td className="px-5 py-3.5 font-semibold text-ink">
                  <Link to={`/admin-master/platform-policies/${policy.id}`} className="text-brand-700 hover:underline">
                    {policy.name}
                  </Link>
                </td>
                <td className="font-numeric px-5 py-3.5 text-neutral-600">{policy.code}</td>
                <td className="px-5 py-3.5">
                  <Badge tone={policy.operationalStatus === 'ACTIVE' ? 'brand' : 'neutral'}>
                    {policy.operationalStatus}
                  </Badge>
                </td>
                <td className="px-5 py-3.5 text-neutral-600">
                  v{policy.versions?.[0]?.versionNumber || '-'} ({policy.versions?.[0]?.status || 'None'})
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
