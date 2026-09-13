import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Waypoints } from 'lucide-react';
import { mlmApi } from '../api/mlm.api';
import { Badge, Button, EmptyState, PageHeader, Spinner, TableShell } from '../../../components/ui';

export default function MlmPoliciesPage() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mlmApi.getPolicies()
      .then(setPolicies)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const items = Array.isArray(policies) ? policies : [];

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Multi-Lender Allocation (MLM)"
        description="Manage lender routing policies and their versions."
        actions={
          <Button as={Link} to="/admin-master/mlm-policies/create">
            <Plus size={15} /> New policy
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading policies…" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Waypoints} title="No policies found" description="Create an MLM policy to define lender routing rules." />
      ) : (
        <TableShell>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Name</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Code</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Status</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Platform product</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Versions</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((policy) => (
              <tr key={policy.id} className="hover:bg-neutral-50/70">
                <td className="px-5 py-3.5 font-semibold text-ink">{policy.name}</td>
                <td className="font-numeric px-5 py-3.5 text-neutral-600">{policy.code}</td>
                <td className="px-5 py-3.5">
                  <Badge tone={policy.operationalStatus === 'ACTIVE' ? 'brand' : 'neutral'}>{policy.operationalStatus}</Badge>
                </td>
                <td className="font-numeric px-5 py-3.5 text-neutral-600">{policy.platformProductId}</td>
                <td className="font-numeric px-5 py-3.5 text-neutral-600">{policy._count?.versions || 0}</td>
                <td className="px-5 py-3.5 text-right">
                  <Link to={`/admin-master/mlm-policies/${policy.id}`} className="font-semibold text-brand-700 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
