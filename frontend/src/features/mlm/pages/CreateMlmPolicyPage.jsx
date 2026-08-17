import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { mlmApi } from '../api/mlm.api';
import { platformProductsApi } from '../../platform-products/api/platform-products.api';

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
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create MLM Policy</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Platform Product</label>
          {isLoading ? (
            <p className="text-sm text-gray-500 mt-1">Loading products...</p>
          ) : (
            <select
              name="platformProductId"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Select a product...</option>
              {platformProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input name="name" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Code</label>
          <input name="code" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea name="description" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"></textarea>
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700">
          Create
        </button>
      </form>
    </div>
  );
}
