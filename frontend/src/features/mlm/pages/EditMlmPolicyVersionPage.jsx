import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { mlmApi } from '../api/mlm.api';
import { getLenders } from '../../lenders/api/lenders.api';
import { productsApi } from '../../products/api/products.api';
import { Button, Card, EmptyState, PageHeader, Select, Spinner } from '../../../components/ui';

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

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading dependencies…" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Configuration"
        title="Edit smooth weighted round robin routes"
        actions={
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={handleAddRoute}>
              <Plus size={15} /> Add route
            </Button>
            <Button onClick={handleSave}>Save routes</Button>
          </div>
        }
      />

      <div className="space-y-4">
        {routes.map((route, idx) => {
          const availableProducts = products.filter(p =>
            (p.lenderId === route.lenderId || (p.lender && p.lender.id === route.lenderId)) &&
            (!policy || !policy.platformProductId || !p.platformProductId || p.platformProductId === policy.platformProductId)
          );
          return (
            <Card key={idx}>
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Select label="Lender" value={route.lenderId} onChange={(e) => handleChange(idx, 'lenderId', e.target.value)}>
                    <option value="">Select lender</option>
                    {lenders.map(l => (
                      <option key={l.id} value={l.id}>{l.displayName || l.legalName} ({l.code})</option>
                    ))}
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Select label="Product" value={route.productId} onChange={(e) => handleChange(idx, 'productId', e.target.value)} disabled={!route.lenderId}>
                    <option value="">Select product</option>
                    {availableProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">
                    Allocation (%)
                    <input
                      type="text"
                      placeholder="e.g. 60.0000"
                      value={route.allocationPercentage}
                      onChange={(e) => handleChange(idx, 'allocationPercentage', e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                    />
                  </label>
                </div>
                <div>
                  <Select label="Active" value={route.isActive} onChange={(e) => handleChange(idx, 'isActive', e.target.value)}>
                    <option value={true}>Yes</option>
                    <option value={false}>No</option>
                  </Select>
                </div>
                <div className="flex justify-end sm:col-span-6">
                  <button
                    onClick={() => {
                      const newRoutes = [...routes];
                      newRoutes.splice(idx, 1);
                      setRoutes(newRoutes);
                    }}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger-600 hover:underline"
                  >
                    <Trash2 size={14} /> Remove route
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
        {routes.length === 0 && (
          <EmptyState title="No routes configured yet" description="Add a route above to get started." />
        )}
      </div>
    </div>
  );
}
