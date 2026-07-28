import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PermissionGate } from '../../../components/ProtectedRoute';
import { Alert, Button, Card, PageHeader, Badge, Spinner } from '../../../components/ui';
import { apiError } from '../../../lib/api';
import { platformProductsApi } from '../api/platform-products.api';

export function PlatformProductsPage() {
  const [data, setData] = useState({ items: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    document.title = 'Platform Products — Personal Loan Platform';
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setLoading(true);
      setError('');
      try {
        const responseData = await platformProductsApi.listPlatformProducts({ page, limit: 10 }, { signal: controller.signal });
        // The API returns either an array (if old logic) or paginated object. Let's handle both safely.
        if (Array.isArray(responseData)) {
          setData({ items: responseData, pagination: {} });
        } else {
          setData(responseData);
        }
      } catch (requestError) {
        if (requestError.code === 'ERR_CANCELED') return;
        setError(apiError(requestError, 'Unable to load platform products.'));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadProducts();
    return () => controller.abort();
  }, [reloadKey, page]);

  const items = data.items || [];
  const hasMore = data.pagination?.page < data.pagination?.totalPages;

  return (
    <>
      <PageHeader
        title="Platform Products"
        description="Manage the central catalog of platform products."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReloadKey((current) => current + 1)}
              disabled={loading}
            >
              Refresh
            </Button>
            <PermissionGate permission="PLATFORM_PRODUCT_CREATE">
              <Link
                to="/admin-master/platform-products/new"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white transition hover:bg-brand-700"
              >
                Add product
              </Link>
            </PermissionGate>
          </div>
        }
      />

      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <h3 className="mb-2 text-lg font-bold text-slate-800">
            No platform products found
          </h3>
          <p className="mb-6 max-w-sm text-slate-500">
            Get started by adding a central platform product to the catalog.
          </p>
          <PermissionGate permission="PLATFORM_PRODUCT_CREATE">
            <Link
              to="/admin-master/platform-products/new"
              className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white transition hover:bg-brand-700"
            >
              Add platform product
            </Link>
          </PermissionGate>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((product) => (
              <Card key={product.id} className="flex flex-col border border-slate-200">
              <div className="flex-1">
                <div className="mb-3 flex items-center justify-between">
                  <Badge tone={product.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {product.status}
                  </Badge>
                  <span className="text-xs font-semibold uppercase text-slate-400">
                    {product.code}
                  </span>
                </div>
                <h3 className="mb-2 text-lg font-bold text-slate-900">
                  {product.name}
                </h3>
                <p className="text-sm text-slate-600">
                  {product.description || 'No description provided.'}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-slate-100">
                <PermissionGate permission="PLATFORM_PRODUCT_UPDATE">
                  <Link
                    to={`/admin-master/platform-products/${product.id}/edit`}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Manage & Edit
                  </Link>
                </PermissionGate>
              </div>
            </Card>
          ))}
          </div>
          {data.pagination?.total > data.pagination?.limit && (
            <div className="mt-6 flex items-center justify-between text-sm text-slate-600">
              <span>{data.pagination.total} total</span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
                <Button variant="secondary" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
