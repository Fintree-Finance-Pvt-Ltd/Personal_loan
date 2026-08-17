import { useState } from 'react';
import { Play, AlertTriangle, RefreshCcw } from 'lucide-react';
import { mlmApi } from '../api/mlm.api';
import AllocationSequencePreview from './AllocationSequencePreview';

export default function MlmSimulationPanel({ versionId, onClose }) {
  const [amount, setAmount] = useState(10000);
  const [previewCount, setPreviewCount] = useState(10);
  const [startFromZero, setStartFromZero] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await mlmApi.simulatePolicyVersion(versionId, {
        requestedAmount: Number(amount),
        previewCount: Number(previewCount),
        startFromZero
      });
      setResult(res);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 mt-8 overflow-hidden">
      <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
        <h3 className="font-semibold text-lg flex items-center">
          <Play size={18} className="mr-2 text-blue-400" />
          MLM Allocation Simulation
        </h3>
        <button onClick={onClose} className="text-slate-300 hover:text-white">&times; Close</button>
      </div>

      <div className="p-4 border-b border-gray-200 bg-amber-50 text-amber-800 flex items-start">
        <AlertTriangle size={18} className="mr-2 mt-0.5 shrink-0" />
        <div className="text-sm">
          <strong>ZERO-WRITE GUARANTEE:</strong> This simulation strictly calculates algorithmic projections in-memory. It will NOT mutate any weights or allocations in the database.
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Requested Amount (₹)</label>
            <input 
              type="number" 
              value={amount} 
              onChange={e => setAmount(e.target.value)}
              className="w-full border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              min="1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preview Count (Apps)</label>
            <input 
              type="number" 
              value={previewCount} 
              onChange={e => setPreviewCount(e.target.value)}
              className="w-full border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              min="1"
              max="100"
            />
          </div>
          <div className="flex items-center pt-6">
            <label className="flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={startFromZero} 
                onChange={e => setStartFromZero(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:ring-blue-500 h-5 w-5 mr-2"
              />
              <span className="text-sm font-medium text-gray-700">Start from Zero Weights</span>
            </label>
          </div>
        </div>

        <button 
          onClick={handleSimulate}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 flex items-center font-medium disabled:opacity-50"
        >
          {loading ? (
            <RefreshCcw size={16} className="animate-spin mr-2" />
          ) : (
            <Play size={16} className="mr-2" />
          )}
          Run Simulation
        </button>

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-8">
            <AllocationSequencePreview result={result} />
          </div>
        )}
      </div>
    </div>
  );
}
