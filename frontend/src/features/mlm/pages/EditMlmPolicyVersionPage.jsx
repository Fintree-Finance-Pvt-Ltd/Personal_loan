import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { mlmApi } from '../api/mlm.api';
import { getLenders } from '../../lenders/api/lenders.api';
import { productsApi } from '../../products/api/products.api';

export default function EditMlmPolicyVersionPage() {
  const { versionId } = useParams();
  const [searchParams] = useSearchParams();
  const policyId = searchParams.get('policyId');
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [lenders, setLenders] = useState([]);
  const [products, setProducts] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDependencies = async () => {
      try {
        const [lendersData, productsData, policyData] = await Promise.all([
          getLenders({ limit: 100, _t: Date.now() }),
          productsApi.listProducts({ limit: 100, _t: Date.now() }),
          policyId ? mlmApi.getPolicyDetails(policyId, { _t: Date.now() }) : Promise.resolve(null)
        ]);
        setLenders(lendersData.items || lendersData || []);
        setProducts(productsData.items || productsData || []);
        setPolicy(policyData);
        if (policyData && policyData.versions) {
          const version = policyData.versions.find(v => v.id === versionId);
          if (version && version.routes && version.routes.length > 0) {
            const loadedRoutes = version.routes.map((r, i) => ({
              lenderId: r.lenderId,
              productId: r.productId,
              allocationPercentage: r.allocationWeightPercent ? String(r.allocationWeightPercent) : '',
              sortOrder: r.sortOrder || r.priority || (i + 1),
              isActive: r.isActive !== false
            }));
            setRoutes(loadedRoutes);
          }
        }
      } catch (err) {
        console.error('Failed to load lenders/products', err);
      } finally {
        setLoading(false);
      }
    };
    loadDependencies();
  }, []);

  const handleAddRoute = () => {
    setRoutes([
      ...routes,
      {
        lenderId: '',
        productId: '',
        allocationPercentage: '',
        sortOrder: routes.length + 1,
        isActive: true,
      },
    ]);
  };

  const handleChange = (index, field, value) => {
    const newRoutes = [...routes];
    if (field === 'isActive') {
      newRoutes[index][field] = value === 'true' || value === true;
    } else {
      newRoutes[index][field] = value;
    }
    setRoutes(newRoutes);
  };

  const parsePercentage = (val) => {
    let str = String(val).trim();
    if (!str) return 0;
    if (!str.includes('.')) str += '.0000';
    let [intPart, decPart] = str.split('.');
    decPart = decPart.padEnd(4, '0').slice(0, 4);
    const num = parseInt(intPart + decPart, 10);
    return isNaN(num) ? 0 : num;
  };

  const handleSave = async () => {
    try {
      // Validate totals
      let total = 0;
      const mappedRoutes = routes.map((r, index) => {
        const valStr = r.allocationPercentage ? String(r.allocationPercentage) : '0.0000';
        if (r.isActive) {
           total += parsePercentage(valStr);
        }
        return {
          lenderId: r.lenderId,
          productId: r.productId,
          allocationPercentage: valStr,
          isActive: r.isActive,
          sortOrder: parseInt(r.sortOrder, 10) || (index + 1),
        };
      });

      if (total > 1000000) {
        const displayTotal = (total / 10000).toFixed(4);
        alert(`Total active allocation percentage cannot exceed 100.0000%. Current total is ${displayTotal}%`);
        return;
      }

      await mlmApi.updatePolicyVersionRoutes(versionId, { routes: mappedRoutes });
      navigate(-1);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      const errors = err.response?.data?.error?.details || err.response?.data?.errors;
      alert(`Failed to save routes: ${msg}\n${errors ? JSON.stringify(errors, null, 2) : ''}`);
    }
  };

  if (loading) return <div className="p-6">Loading dependencies...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Edit Smooth Weighted Round Robin Routes</h1>
        <div className="space-x-2">
          <button onClick={handleAddRoute} className="bg-gray-200 text-gray-800 px-4 py-2 rounded shadow hover:bg-gray-300">
            Add Route
          </button>
          <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700">
            Save Routes
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {routes.map((route, idx) => {
          const availableProducts = products.filter(p => 
            (p.lenderId === route.lenderId || (p.lender && p.lender.id === route.lenderId)) &&
            (!policy || !policy.platformProductId || !p.platformProductId || p.platformProductId === policy.platformProductId)
          );
          return (
            <div key={idx} className="bg-white p-4 rounded shadow border grid grid-cols-6 gap-4 items-end">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Lender</label>
                <select value={route.lenderId} onChange={(e) => handleChange(idx, 'lenderId', e.target.value)} className="w-full border rounded p-2">
                  <option value="">Select Lender</option>
                  {lenders.map(l => (
                    <option key={l.id} value={l.id}>{l.displayName || l.legalName} ({l.code})</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Product</label>
                <select value={route.productId} onChange={(e) => handleChange(idx, 'productId', e.target.value)} className="w-full border rounded p-2" disabled={!route.lenderId}>
                  <option value="">Select Product</option>
                  {availableProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Allocation (%)</label>
                <input type="text" placeholder="e.g. 60.0000" value={route.allocationPercentage} onChange={(e) => handleChange(idx, 'allocationPercentage', e.target.value)} className="w-full border rounded p-2" />
              </div>
              <div className="flex flex-col gap-1 items-end">
                <label className="block text-sm font-medium">Active</label>
                <select value={route.isActive} onChange={(e) => handleChange(idx, 'isActive', e.target.value)} className="border rounded p-2">
                   <option value={true}>Yes</option>
                   <option value={false}>No</option>
                </select>
              </div>
              <div className="col-span-6 flex justify-end">
                <button onClick={() => {
                  const newRoutes = [...routes];
                  newRoutes.splice(idx, 1);
                  setRoutes(newRoutes);
                }} className="text-red-500 hover:underline text-sm font-medium">Remove Route</button>
              </div>
            </div>
          );
        })}
        {routes.length === 0 && <div className="text-center p-8 bg-gray-50 border rounded text-gray-500">No routes configured yet. Add one above.</div>}
      </div>
      <div className="mt-8 p-4 bg-gray-100 rounded text-xs overflow-auto">
        <pre>
          {JSON.stringify({
            policyPlatformProductId: policy?.platformProductId,
            routes,
            availableProductsRoute0: routes[0] ? products.filter(p => (p.lenderId === routes[0].lenderId || (p.lender && p.lender.id === routes[0].lenderId)) && (policy && p.platformProductId === policy.platformProductId)).map(p => p.id) : [],
            products: products.map(p => ({ id: p.id, lenderId: p.lenderId, platformProductId: p.platformProductId }))
          }, null, 2)}
        </pre>
      </div>
    </div>
  );
}
