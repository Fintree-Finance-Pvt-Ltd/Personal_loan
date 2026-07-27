import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, PageHeader, Spinner } from '../../../components/ui';
import { productsApi } from '../api/products.api';
import { ProductStatusBadge, ProductVersionStatusBadge } from '../components/ProductStatusBadge';
import { PermissionGate } from '../../../components/ProtectedRoute';
import { apiError } from '../../../lib/api';

export function ProductsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [versionStatusFilter, setVersionStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { document.title = 'Products — Admin Panel'; }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    productsApi.listProducts({ 
      search, 
      operationalStatus: statusFilter || undefined, 
      versionStatus: versionStatusFilter || undefined, 
      page, 
      limit: 20 
    })
      .then(setData)
      .catch(err => { if (err.name !== 'CanceledError') setError(apiError(err, 'Failed to load products.')); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [search, statusFilter, versionStatusFilter, page]);

  return (
    <div>
      <PageHeader
        title="Products"
        description="Manage lender-specific personal-loan products and their versioned offer strategies."
        actions={
          <PermissionGate permission="PRODUCT_CREATE">
            <Button as={Link} to="/admin-master/products/new">+ Add product</Button>
          </PermissionGate>
        }
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <input type="search" placeholder="Search products or lenders…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm sm:max-w-xs" />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select value={versionStatusFilter} onChange={e => { setVersionStatusFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm">
          <option value="">All version statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="ACTIVE">Active</option>
          <option value="SUPERSEDED">Superseded</option>
        </select>
      </div>

      {error && <Alert>{error}</Alert>}
      {loading && <div className="flex justify-center py-16 text-brand-700"><Spinner label="Loading products" /></div>}

      {!loading && !error && (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-100 bg-slate-50 text-slate-700 font-semibold">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3 hidden sm:table-cell">Lender</th>
                  <th className="px-5 py-3">Strategy</th>
                  <th className="px-5 py-3 hidden md:table-cell">Operational Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items?.length === 0 && (
                  <tr><td colSpan={5} className="py-12 text-center text-slate-400">No products found.</td></tr>
                )}
                {data?.items?.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="font-mono text-xs text-slate-400">{item.code}</p>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <p className="text-slate-900">{item.lender.displayName}</p>
                      <p className="font-mono text-xs text-slate-400">{item.lender.code}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {item.activeVersion ? (
                        <div>
                          <ProductVersionStatusBadge status="ACTIVE" /> <span className="text-xs text-slate-500 ml-1">v{item.activeVersion.versionNumber}</span>
                          <p className="text-xs mt-1 text-slate-500">Base: {item.activeVersion.firstLoanBaseAmount} · Max: {item.activeVersion.maximumAmountCap}</p>
                        </div>
                      ) : (
                        item.latestVersion ? (
                          <div>
                            <ProductVersionStatusBadge status={item.latestVersion.status} /> <span className="text-xs text-slate-500 ml-1">v{item.latestVersion.versionNumber}</span>
                          </div>
                        ) : <span className="text-slate-400 italic">No version</span>
                      )}
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <ProductStatusBadge status={item.operationalStatus} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link to={`/admin-master/products/${item.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-800">
                        View
                      </Link>
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
