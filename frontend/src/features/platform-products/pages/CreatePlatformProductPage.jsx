import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  Input,
  PageHeader,
  Textarea,
} from '../../../components/ui';
import { apiError } from '../../../lib/api';
import { platformProductsApi } from '../api/platform-products.api';

export function CreatePlatformProductPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await platformProductsApi.createPlatformProduct(formData);
      navigate('/admin-master/platform-products');
    } catch (err) {
      setError(apiError(err, 'Failed to create platform product.'));
      setLoading(false);
    }
  };

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
        title="Add platform product"
        description="Create a new central product for the platform."
      />

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <h2 className="font-display mb-6 text-lg font-bold text-ink">
            Product identity
          </h2>

          <div className="space-y-6">
            <Input
              label="Product name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Premium Personal Loan"
              required
            />

            <Input
              label="Product code"
              name="code"
              value={formData.code}
              onChange={handleChange}
              placeholder="e.g. PREM-PL"
              required
            />

            <Textarea
              label="Description (optional)"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="Short description..."
            />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button as={Link} to="/admin-master/platform-products" variant="secondary">
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create platform product'}
          </Button>
        </div>
      </form>
    </div>
  );
}
