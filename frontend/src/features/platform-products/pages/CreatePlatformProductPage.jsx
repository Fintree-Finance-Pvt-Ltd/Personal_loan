import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Input,
  PageHeader,
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
      <div className="mb-6 flex items-center gap-4">
        <Link
          to="/admin-master/platform-products"
          className="text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          &larr; Back to catalog
        </Link>
      </div>

      <PageHeader
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
          <h2 className="mb-6 text-lg font-bold text-slate-900">
            Product Identity
          </h2>

          <div className="space-y-6">
            <Input
              label="Product Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Premium Personal Loan"
              required
            />
            
            <Input
              label="Product Code"
              name="code"
              value={formData.code}
              onChange={handleChange}
              placeholder="e.g. PREM-PL"
              required
            />

            <label className="block text-sm font-medium text-slate-700">
              Description (Optional)
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                placeholder="Short description..."
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
            {loading ? 'Creating...' : 'Create platform product'}
          </Button>
        </div>
      </form>
    </div>
  );
}
