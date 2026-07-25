import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, PageHeader, Spinner } from '../../../components/ui';
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
        title="Permission Catalogue"
        description="All permissions available in the platform. This list is source-controlled and read-only."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          placeholder="Search by code or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600 sm:max-w-xs"
        />
        <select
          value={filterModule}
          onChange={e => setFilterModule(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-brand-600"
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
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          No permissions found.
        </div>
      )}

      {!loading && !error && Object.entries(grouped).map(([module, perms]) => (
        <section key={module} className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-400">
            <Badge tone="neutral">{module}</Badge>
            <span className="text-slate-300">·</span>
            <span className="normal-case font-normal tracking-normal text-slate-500">{perms.length} permission{perms.length !== 1 ? 's' : ''}</span>
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-slate-700">Code</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-700">Description</th>
                </tr>
              </thead>
              <tbody>
                {perms.map((perm, i) => (
                  <tr key={perm.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-5 py-3 font-mono text-xs text-brand-700">{perm.code}</td>
                    <td className="px-5 py-3 text-slate-600">{perm.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
