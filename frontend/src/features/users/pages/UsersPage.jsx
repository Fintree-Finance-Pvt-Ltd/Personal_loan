import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, PageHeader, Spinner } from '../../../components/ui';
import { UserStatusBadge } from '../components/UserStatusBadge';
import { PermissionGate } from '../../../components/ProtectedRoute';
import { getUsers } from '../api/users.api';
import { apiError } from '../../../lib/api';

function formatDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function UsersPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { document.title = 'Users — Admin Panel'; }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    getUsers({ search, status: statusFilter || undefined, roleCode: roleFilter || undefined, page, limit: 20 }, controller.signal)
      .then(setData)
      .catch(err => { if (err.name !== 'CanceledError') setError(apiError(err, 'Failed to load users.')); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [search, statusFilter, roleFilter, page]);

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage admin users, roles and account status."
        actions={
          <PermissionGate permission="USER_CREATE">
            <Link to="/admin-master/users/new">
              <Button>+ Add user</Button>
            </Link>
          </PermissionGate>
        }
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <input type="search" placeholder="Search by name or email…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm sm:max-w-xs" />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="LOCKED">Locked</option>
          <option value="DISABLED">Disabled</option>
        </select>
        <input type="text" placeholder="Filter by role code…" value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm" />
      </div>

      {error && <Alert>{error}</Alert>}
      {loading && <div className="flex justify-center py-16 text-brand-700"><Spinner label="Loading users" /></div>}

      {!loading && !error && (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-slate-700">User</th>
                  <th className="hidden px-5 py-3 text-left font-semibold text-slate-700 sm:table-cell">Roles</th>
                  <th className="hidden px-5 py-3 text-left font-semibold text-slate-700 md:table-cell">Last login</th>
                  <th className="hidden px-5 py-3 text-left font-semibold text-slate-700 lg:table-cell">Created</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items?.length === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-slate-400">No users found.</td></tr>
                )}
                {data?.items?.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </td>
                    <td className="hidden px-5 py-3 sm:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.slice(0, 3).map(r => (
                          <Badge key={r.code} tone="neutral">{r.code}</Badge>
                        ))}
                        {user.roles.length > 3 && <Badge tone="neutral">+{user.roles.length - 3}</Badge>}
                      </div>
                    </td>
                    <td className="hidden px-5 py-3 text-slate-500 md:table-cell">{formatDate(user.lastLoginAt)}</td>
                    <td className="hidden px-5 py-3 text-slate-500 lg:table-cell">{formatDate(user.createdAt)}</td>
                    <td className="px-5 py-3"><UserStatusBadge status={user.status} /></td>
                    <td className="px-5 py-3 text-right">
                      <Link to={`/admin-master/users/${user.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-800">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.total > data.limit && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
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
