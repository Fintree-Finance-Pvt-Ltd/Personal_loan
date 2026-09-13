import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PieChart } from 'lucide-react';
import { mlmApi } from '../api/mlm.api';
import { platformProductsApi } from '../../platform-products/api/platform-products.api';
import { Alert, Badge, EmptyState, PageHeader, Spinner } from '../../../components/ui';
import DistributionFilters from '../components/DistributionFilters';
import DistributionSummary from '../components/DistributionSummary';
import DistributionTable from '../components/DistributionTable';

export default function MlmDistributionDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [platformProducts, setPlatformProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const filters = {
    platformProductId: searchParams.get('platformProductId') || '',
    readiness: searchParams.get('readiness') || '',
    versionId: searchParams.get('versionId') || '',
  };

  const loadProducts = async () => {
    try {
      const prods = await platformProductsApi.listPlatformProducts();
      setPlatformProducts(prods);
      
      // Default to first active product if no filters applied and no versionId
      if (!filters.platformProductId && !filters.versionId && prods.length > 0) {
        handleFilterChange('platformProductId', prods[0].id);
      } else if (prods.length === 0 || !filters.platformProductId) {
        // If there are no products, or we don't have one selected, stop loading
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to load platform products', err);
      setLoading(false);
    }
  };

  const loadDashboard = async () => {
    if (!filters.platformProductId && !filters.versionId) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await mlmApi.getDistributionDashboard(filters);
      setData(response);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Failed to load dashboard data');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (filters.platformProductId || filters.versionId) {
      loadDashboard();
    }
  }, [searchParams]);

  const handleFilterChange = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    // Reset versionId if we manually select a product (to fetch active version of that product)
    if (key === 'platformProductId') {
       newParams.delete('versionId');
    }
    setSearchParams(newParams);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Configuration"
        title="Distribution dashboard"
        description="Monitor real-time MLM allocation routing metrics, variances, and route readiness."
      />

      <DistributionFilters
        platformProducts={platformProducts}
        filters={filters}
        onChange={handleFilterChange}
        onRefresh={loadDashboard}
        isLoading={loading}
      />

      {error ? (
        <Alert>
          <strong>Error:</strong> {error}
        </Alert>
      ) : loading && !data ? (
        <div className="flex justify-center p-12">
          <Spinner label="Loading dashboard…" />
        </div>
      ) : data ? (
        <>
          <div className="mb-4 flex items-center justify-between text-sm text-neutral-500">
            <span>Viewing policy: <span className="font-semibold text-ink">{data.policyContext.policyId}</span></span>
            <Badge tone="neutral">v{data.policyContext.versionNumber}</Badge>
          </div>

          <DistributionSummary summary={data.summary} />
          <DistributionTable distribution={data.distribution} />
        </>
      ) : (
        <EmptyState icon={PieChart} title="No product selected" description="Select a platform product to view its distribution dashboard." />
      )}
    </div>
  );
}
