import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, EmptyState, PageHeader, Spinner, TableShell } from '../../../components/ui';
import { getPermissions } from '../api/permissions.api';
import { apiError } from '../../../lib/api';

export function PermissionsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('');

  useEffect(() => {
    document.title = 'Permissions — Admin Panel';
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getPermissions({ search: search || undefined, module: filterModule || undefined }, controller.signal)
      .then(setData)
      .catch(err => {
        if (err.name !== 'CanceledError') setError(apiError(err, 'Failed to load permissions.'));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [search, filterModule]);

  const modules = useMemo(() => {
    if (!data?.items) return [];
    return [...new Set(data.items.map(p => p.module))].sort();
  }, [data]);

  const grouped = useMemo(() => {
    if (!data?.items) return {};
    const groups = {};
    for (const perm of data.items) {
      if (!groups[perm.module]) groups[perm.module] = [];
      groups[perm.module].push(perm);
    }
    return groups;
  }, [data]);

  return (
    <div>
      <PageHeader
        eyebrow="Access management"
        title="Permission catalogue"
        description="All permissions available in the platform. This list is source-controlled and read-only."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          placeholder="Search by code or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-brand-600 sm:max-w-xs"
        />
        <select
          value={filterModule}
          onChange={e => setFilterModule(e.target.value)}
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 shadow-sm focus:border-brand-600"
        >
          <option value="">All modules</option>
          {modules.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {error && <Alert>{error}</Alert>}

      {loading && (
        <div className="flex justify-center py-16 text-brand-700">
          <Spinner label="Loading permissions" />
        </div>
      )}

      {!loading && !error && data?.items?.length === 0 && (
        <EmptyState title="No permissions found" description="Try adjusting your search or module filter." />
      )}

      {!loading && !error && Object.entries(grouped).map(([module, perms]) => (
        <section key={module} className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-neutral-400">
            <Badge tone="neutral">{module}</Badge>
            <span className="text-neutral-300">·</span>
            <span className="normal-case font-normal tracking-normal text-neutral-500">{perms.length} permission{perms.length !== 1 ? 's' : ''}</span>
          </h2>
          <TableShell>
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Code</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {perms.map((perm) => (
                  <tr key={perm.id} className="hover:bg-neutral-50/70">
                    <td className="px-5 py-3.5 font-mono text-xs text-brand-700">{perm.code}</td>
                    <td className="px-5 py-3.5 text-neutral-600">{perm.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
          </TableShell>
        </section>
      ))}
    </div>
  );
}
