import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  Input,
  PageHeader,
  Spinner,
  Badge,
  Textarea,
} from '../../../components/ui';
import { PermissionGate } from '../../../components/ProtectedRoute';
import { apiError } from '../../../lib/api';
import { platformProductsApi } from '../api/platform-products.api';

export function EditPlatformProductPage() {
  const { platformProductId } = useParams();

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
      <div className="mb-4 flex items-center gap-4">
        <Link
          to="/admin-master/platform-products"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft size={14} /> Back to catalog
        </Link>
      </div>

      <PageHeader
        eyebrow="Configuration"
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
            <h2 className="font-display text-lg font-bold text-ink">
              Product identity
            </h2>
            <Badge tone={productStatus === 'ACTIVE' ? 'brand' : 'neutral'}>
              {productStatus}
            </Badge>
          </div>

          <div className="space-y-6">
            <Input
              label="Product name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />

            <Input
              label="Product code (immutable)"
              name="code"
              value={productCode}
              disabled
            />

            <Textarea
              label="Description (optional)"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
            />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button as={Link} to="/admin-master/platform-products" variant="secondary">
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
