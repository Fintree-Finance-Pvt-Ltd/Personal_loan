import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { mlmApi } from '../api/mlm.api';
import { platformProductsApi } from '../../platform-products/api/platform-products.api';
import { Button, Card, Input, PageHeader, Select, Textarea } from '../../../components/ui';

export default function CreateMlmPolicyPage() {
  const navigate = useNavigate();
  const [platformProducts, setPlatformProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await platformProductsApi.listPlatformProducts({ status: 'ACTIVE' });
        setPlatformProducts(Array.isArray(response) ? response : (response.items || []));
      } catch (err) {
        console.error('Failed to load platform products', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = {
      name: e.target.name.value,
      code: e.target.code.value,
      description: e.target.description.value,
      platformProductId: e.target.platformProductId.value,
    };
    try {
      const policy = await mlmApi.createPolicy(data);
      navigate(`/admin-master/mlm-policies/${policy.id}`);
    } catch (err) {
      alert('Failed to create policy');
      console.error(err);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Configuration" title="Create MLM policy" description="Define a new lender-routing allocation policy." />
      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Select label="Platform product" name="platformProductId" required disabled={isLoading}>
            <option value="">{isLoading ? 'Loading products…' : 'Select a product…'}</option>
            {platformProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </Select>

          <Input label="Name" name="name" required />
          <Input label="Code" name="code" required />
          <Textarea label="Description" name="description" rows={3} />

          <Button type="submit">Create</Button>
        </form>
      </Card>
    </div>
  );
}
