import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { mlmApi } from '../api/mlm.api';
import { platformProductsApi } from '../../platform-products/api/platform-products.api';
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Allocation Distribution Dashboard</h1>
        <p className="text-gray-500 mt-1">Monitor real-time MLM allocation routing metrics, variances, and route readiness.</p>
      </div>

      <DistributionFilters 
        platformProducts={platformProducts} 
        filters={filters} 
        onChange={handleFilterChange} 
        onRefresh={loadDashboard}
        isLoading={loading}
      />

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      ) : loading && !data ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : data ? (
        <>
          <div className="mb-4 flex items-center justify-between text-sm text-gray-500">
            <span>Viewing Policy: <span className="font-semibold text-gray-700">{data.policyContext.policyId}</span></span>
            <span>Active Version: <span className="font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded">v{data.policyContext.versionNumber}</span></span>
          </div>
          
          <DistributionSummary summary={data.summary} />
          <DistributionTable distribution={data.distribution} />
        </>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-8 text-center">
           <p className="text-gray-500">Select a Platform Product to view its distribution dashboard.</p>
        </div>
      )}
    </div>
  );
}
