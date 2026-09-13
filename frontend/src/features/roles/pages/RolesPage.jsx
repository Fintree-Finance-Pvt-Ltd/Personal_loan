import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Alert, Badge, Button, EmptyState, PageHeader, Spinner, TableShell } from '../../../components/ui';
import { getRoles } from '../api/roles.api';
import { RoleStatusBadge } from '../components/RoleStatusBadge';
import { PermissionGate } from '../../../components/ProtectedRoute';
import { apiError } from '../../../lib/api';

export function RolesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { document.title = 'Roles — Admin Panel'; }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    getRoles({ search, status: statusFilter || undefined, isSystem: typeFilter === 'system' ? true : typeFilter === 'custom' ? false : undefined, page, limit: 20 }, controller.signal)
      .then(setData)
      .catch(err => { if (err.name !== 'CanceledError') setError(apiError(err, 'Failed to load roles.')); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [search, statusFilter, typeFilter, page]);

  return (
    <div>
      <PageHeader
        eyebrow="Access management"
        title="Roles"
        description="Manage role definitions and their permission assignments."
        actions={
          <PermissionGate permission="ROLE_CREATE">
            <Button as={Link} to="/admin-master/roles/new"><Plus size={15} /> Add role</Button>
          </PermissionGate>
        }
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <input type="search" placeholder="Search roles…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 shadow-sm sm:max-w-xs" />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm shadow-sm">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm shadow-sm">
          <option value="">System + Custom</option>
          <option value="system">System only</option>
          <option value="custom">Custom only</option>
        </select>
      </div>

      {error && <Alert>{error}</Alert>}
      {loading && <div className="flex justify-center py-16 text-brand-700"><Spinner label="Loading roles" /></div>}

      {!loading && !error && data?.items?.length === 0 && (
        <EmptyState title="No roles found" description="Try adjusting your search or filters." />
      )}

      {!loading && !error && data?.items?.length > 0 && (
        <>
          <TableShell>
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Name / code</th>
                  <th className="hidden px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500 sm:table-cell">Type</th>
                  <th className="hidden px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500 md:table-cell">Permissions</th>
                  <th className="hidden px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500 lg:table-cell">Users</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data?.items?.map(role => (
                  <tr key={role.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-neutral-900">{role.name}</p>
                      <p className="font-mono text-xs text-neutral-400">{role.code}</p>
                    </td>
                    <td className="hidden px-5 py-3 sm:table-cell">
                      <Badge tone={role.isSystem ? 'brand' : 'neutral'}>{role.isSystem ? 'System' : 'Custom'}</Badge>
                    </td>
                    <td className="hidden px-5 py-3 text-neutral-600 md:table-cell">{role.permissionCount}</td>
                    <td className="hidden px-5 py-3 text-neutral-600 lg:table-cell">{role.assignedUserCount}</td>
                    <td className="px-5 py-3"><RoleStatusBadge status={role.status} /></td>
                    <td className="px-5 py-3 text-right">
                      <Link to={`/admin-master/roles/${role.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-800">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
          </TableShell>

          {data && data.total > data.limit && (
            <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
              <span>{data.total} total</span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPage(p => p - 1)} disabled={page === 1}>Prev</Button>
                <Button variant="secondary" onClick={() => setPage(p => p + 1)} disabled={page * data.limit >= data.total}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
