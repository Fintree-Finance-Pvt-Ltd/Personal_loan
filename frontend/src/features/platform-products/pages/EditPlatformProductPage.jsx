import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Input,
  PageHeader,
  Spinner,
  Badge,
} from '../../../components/ui';
import { PermissionGate } from '../../../components/ProtectedRoute';
import { apiError } from '../../../lib/api';
import { platformProductsApi } from '../api/platform-products.api';

export function EditPlatformProductPage() {
  const { platformProductId } = useParams();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });
  const [productCode, setProductCode] = useState('');
  const [productStatus, setProductStatus] = useState('');
  
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    
    async function fetchProduct() {
      try {
        const data = await platformProductsApi.getPlatformProduct(platformProductId);
        setFormData({
          name: data.name,
          description: data.description || '',
        });
        setProductCode(data.code);
        setProductStatus(data.status);
      } catch (err) {
        if (err.code !== 'ERR_CANCELED') {
          setError(apiError(err, 'Failed to load platform product.'));
        }
      } finally {
        setInitialLoading(false);
      }
    }
    
    fetchProduct();
    return () => controller.abort();
  }, [platformProductId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      await platformProductsApi.updatePlatformProduct(platformProductId, formData);
      setSuccessMsg('Platform product updated successfully.');
    } catch (err) {
      setError(apiError(err, 'Failed to update platform product.'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    setStatusLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      if (productStatus === 'ACTIVE') {
        const updated = await platformProductsApi.deactivatePlatformProduct(platformProductId);
        setProductStatus(updated.status);
        setSuccessMsg('Platform product deactivated.');
      } else {
        const updated = await platformProductsApi.activatePlatformProduct(platformProductId);
        setProductStatus(updated.status);
        setSuccessMsg('Platform product activated.');
      }
    } catch (err) {
      setError(apiError(err, 'Failed to update product status.'));
    } finally {
      setStatusLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Link
          to="/admin-master/platform-products"
          className="text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          &larr; Back to catalog
        </Link>
      </div>

      <PageHeader
        title="Edit platform product"
        description="Update the central platform product details."
        actions={
          <div className="flex gap-3">
            <PermissionGate permission="PLATFORM_PRODUCT_STATUS_UPDATE">
              <Button
                variant="secondary"
                onClick={handleToggleStatus}
                disabled={statusLoading}
              >
                {statusLoading ? 'Updating...' : productStatus === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </Button>
            </PermissionGate>
          </div>
        }
      />

      {error && <div className="mb-6"><Alert>{error}</Alert></div>}
      {successMsg && <div className="mb-6"><Alert tone="success">{successMsg}</Alert></div>}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">
              Product Identity
            </h2>
            <Badge tone={productStatus === 'ACTIVE' ? 'success' : 'neutral'}>
              {productStatus}
            </Badge>
          </div>

          <div className="space-y-6">
            <Input
              label="Product Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
            
            <Input
              label="Product Code (Immutable)"
              name="code"
              value={productCode}
              disabled
            />

            <label className="block text-sm font-medium text-slate-700">
              Description (Optional)
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </label>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Link
            to="/admin-master/platform-products"
            className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </Link>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
