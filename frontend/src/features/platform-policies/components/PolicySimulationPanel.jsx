import { useState } from 'react';
import { platformPoliciesApi } from '../api/platform-policies.api';
import { Button } from '../../../components/ui';

export default function PolicySimulationPanel({ versionId, rules }) {
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Group active rules to find which inputs we need
  const activeRules = rules.filter(r => r.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

  const handleInputChange = (key, value, type) => {
    let parsedValue = value;
    if (type === 'BOOLEAN') parsedValue = value === 'true';
    if (type === 'INTEGER' && key !== 'dateOfBirth') parsedValue = value ? parseInt(value, 10) : '';
    if (type === 'INTEGER' && key === 'dateOfBirth') parsedValue = value; // Keep as string for dateOfBirth
    if (type === 'DECIMAL') parsedValue = value; // Keep as string for decimal comparison later
    if (type === 'STRING_ARRAY') parsedValue = value ? value.split(',').map(s => s.trim()) : [];
    
    setInputs(prev => ({ ...prev, [key]: parsedValue }));
  };

  const runSimulation = async () => {
    setLoading(true);
    try {
      // Create simulation payload
      const payload = {
        inputs,
        evaluationDate: new Date().toISOString()
      };
      const res = await platformPoliciesApi.simulatePolicy(versionId, payload);
      setResult(res);
    } catch (err) {
      alert(err.response?.data?.message || 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  const getOutcomeColor = (outcome) => {
    switch (outcome) {
      case 'PASS': return 'bg-brand-100 text-brand-700';
      case 'FAIL': return 'bg-danger-100 text-danger-700';
      case 'REFER': return 'bg-caution-100 text-caution-700';
      case 'POLICY_INPUT_MISSING': return 'bg-neutral-100 text-neutral-700';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-200">
        <h2 className="text-lg font-semibold">Policy Simulator</h2>
        <p className="text-sm text-neutral-500">Test this version against sample input data.</p>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Input Form */}
        <div className="space-y-4">
          <h3 className="font-medium text-neutral-900 border-b pb-2">Simulation Inputs</h3>
          {activeRules.map((rule, idx) => {
            // Display each rule's input expectation
            // We ensure we only display one input field per unique key
            const isFirstOccurrence = activeRules.findIndex(r => r.inputKey === rule.inputKey) === idx;
            if (!isFirstOccurrence) return null;

            return (
              <div key={rule.inputKey}>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  {rule.inputKey} <span className="text-neutral-400 text-xs">({rule.valueType})</span>
                </label>
                {rule.valueType === 'BOOLEAN' ? (
                  <select 
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg"
                    onChange={(e) => handleInputChange(rule.inputKey, e.target.value, rule.valueType)}
                  >
                    <option value="">Select...</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <input
                    type={rule.inputKey === 'dateOfBirth' ? 'date' : (rule.valueType === 'INTEGER' || rule.valueType === 'DECIMAL' ? 'number' : 'text')}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg"
                    placeholder={`Enter ${rule.valueType.toLowerCase()}...`}
                    onChange={(e) => handleInputChange(rule.inputKey, e.target.value, rule.valueType)}
                  />
                )}
              </div>
            );
          })}
          <div className="pt-4">
            <Button onClick={runSimulation} disabled={loading || activeRules.length === 0} className="w-full">
              {loading ? 'Running...' : 'Run Simulation'}
            </Button>
          </div>
        </div>

        {/* Results */}
        <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200">
          <h3 className="font-medium text-neutral-900 border-b pb-2 mb-4">Simulation Results</h3>
          {result ? (
            <div>
              <div className="mb-6 p-4 bg-white rounded-lg border border-neutral-200 text-center shadow-sm">
                <span className="text-sm text-neutral-500 uppercase font-semibold tracking-wider">Final Outcome</span>
                <div className={`mt-2 text-2xl font-bold py-2 rounded-lg ${getOutcomeColor(result.finalOutcome)}`}>
                  {result.finalOutcome}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Rule Evaluation Log</h4>
                {result.ruleResults?.map((r, i) => (
                  <div key={i} className="bg-white p-3 rounded border border-neutral-200 shadow-sm flex flex-col gap-1 text-sm">
                    <div className="flex justify-between items-start">
                      <span className="font-medium text-neutral-900">{r.ruleCode}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getOutcomeColor(r.outcome)}`}>{r.outcome}</span>
                    </div>
                    {r.message && <p className="text-danger-600 text-xs mt-1">Reason: {r.message} ({r.reasonCode})</p>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-neutral-500 py-12">
              Enter inputs and run the simulation to see results.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
