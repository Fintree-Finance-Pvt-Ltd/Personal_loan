import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Package, Pencil, Plus, RefreshCw } from 'lucide-react';
import { PermissionGate } from '../../../components/ProtectedRoute';
import { Alert, Button, Card, EmptyState, PageHeader, Badge, Spinner } from '../../../components/ui';
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
        eyebrow="Configuration"
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
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
            <PermissionGate permission="PLATFORM_PRODUCT_CREATE">
              <Button as={Link} to="/admin-master/platform-products/new">
                <Plus size={15} /> Add product
              </Button>
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
        <EmptyState
          icon={Package}
          title="No platform products found"
          description="Get started by adding a central platform product to the catalog."
          action={
            <PermissionGate permission="PLATFORM_PRODUCT_CREATE">
              <Button as={Link} to="/admin-master/platform-products/new">
                <Plus size={15} /> Add platform product
              </Button>
            </PermissionGate>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((product) => (
              <Card key={product.id} className="flex flex-col">
              <div className="flex-1">
                <div className="mb-3 flex items-center justify-between">
                  <Badge tone={product.status === 'ACTIVE' ? 'brand' : 'neutral'}>
                    {product.status}
                  </Badge>
                  <span className="font-numeric text-xs font-semibold uppercase text-neutral-400">
                    {product.code}
                  </span>
                </div>
                <h3 className="font-display mb-2 text-lg font-bold text-ink">
                  {product.name}
                </h3>
                <p className="text-sm text-neutral-600">
                  {product.description || 'No description provided.'}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
                <PermissionGate permission="PLATFORM_PRODUCT_UPDATE">
                  <Button as={Link} to={`/admin-master/platform-products/${product.id}/edit`} variant="secondary" className="!min-h-9 !px-3 text-sm">
                    <Pencil size={13} /> Manage &amp; edit
                  </Button>
                </PermissionGate>
              </div>
            </Card>
          ))}
          </div>
          {data.pagination?.total > data.pagination?.limit && (
            <div className="mt-6 flex items-center justify-between text-sm text-neutral-600">
              <span>{data.pagination.total} total</span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft size={15} /> Prev</Button>
                <Button variant="secondary" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>Next <ChevronRight size={15} /></Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
