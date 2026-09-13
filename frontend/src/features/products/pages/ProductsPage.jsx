import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { Alert, Button, EmptyState, PageHeader, Spinner, TableShell } from '../../../components/ui';
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
        eyebrow="Configuration"
        title="Products"
        description="Manage lender-specific personal-loan products and their versioned offer strategies."
        actions={
          <PermissionGate permission="PRODUCT_CREATE">
            <Button as={Link} to="/admin-master/products/new"><Plus size={15} /> Add product</Button>
          </PermissionGate>
        }
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input type="search" placeholder="Search products or lenders…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-neutral-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-neutral-900 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select value={versionStatusFilter} onChange={e => { setVersionStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100">
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

      {!loading && !error && data?.items?.length === 0 && (
        <EmptyState title="No products found" description="Try adjusting your search or filters." />
      )}

      {!loading && !error && data?.items?.length > 0 && (
        <>
          <TableShell>
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Product</th>
                  <th className="hidden px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500 sm:table-cell">Lender</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Strategy</th>
                  <th className="hidden px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500 md:table-cell">Operational status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data?.items?.map(item => (
                  <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-neutral-900">{item.name}</p>
                      <p className="font-mono text-xs text-neutral-500 mb-1">{item.code}</p>
                      {item.platformProduct && (
                        <div className="mt-1 inline-flex items-center gap-1.5 rounded bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                          <span>{item.platformProduct.name}</span>
                          <span className="text-brand-600/60 opacity-80">({item.platformProduct.code})</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <p className="text-neutral-900">{item.lender.displayName}</p>
                      <p className="font-mono text-xs text-neutral-400">{item.lender.code}</p>
                    </td>
                    <td className="px-5 py-3 text-neutral-700">
                      {item.activeVersion ? (
                        <div>
                          <ProductVersionStatusBadge status="ACTIVE" /> <span className="text-xs text-neutral-500 ml-1">v{item.activeVersion.versionNumber}</span>
                          <p className="text-xs mt-1 text-neutral-500">Base: {item.activeVersion.firstLoanBaseAmount} · Max: {item.activeVersion.maximumAmountCap}</p>
                        </div>
                      ) : (
                        item.latestVersion ? (
                          <div>
                            <ProductVersionStatusBadge status={item.latestVersion.status} /> <span className="text-xs text-neutral-500 ml-1">v{item.latestVersion.versionNumber}</span>
                          </div>
                        ) : <span className="text-neutral-400 italic">No version</span>
                      )}
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <ProductStatusBadge status={item.operationalStatus} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link to={`/admin-master/products/${item.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-800">
                        View <ChevronRight size={14} />
                      </Link>
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
