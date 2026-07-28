import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui';
import { apiError } from '../../../lib/api';
import { productsApi } from '../api/products.api';
import { ProductForm } from '../components/ProductForm';

export function CreateProductPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Add product — Admin Panel';
  }, []);

  const handleSubmit = async (payload) => {
    setBusy(true);
    setError('');

    try {
      const product = await productsApi.createProduct(payload);
      navigate(`/admin-master/products/${product.id}`, {
        replace: true,
        state: { message: 'Product created successfully.' },
      });
    } catch (requestError) {
      setError(apiError(requestError, 'Unable to create product. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Add product"
        description="Create a new lender-specific product and its initial version strategy."
      />

      <ProductForm
        busy={busy}
        serverError={error}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/admin-master/products')}
      />
    </>
  );
}
