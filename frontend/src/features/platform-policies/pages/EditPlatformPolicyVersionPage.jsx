import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { platformPoliciesApi } from '../api/platform-policies.api';
import { Button } from '../../../components/ui';
import PolicyRulesEditor from '../components/PolicyRulesEditor';

export default function EditPlatformPolicyVersionPage() {
  const { policyId, versionId } = useParams();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, [policyId, versionId]);

  const fetchData = async () => {
    try {
      const [p, c] = await Promise.all([
        platformPoliciesApi.findOne(policyId),
        platformPoliciesApi.getRuleCatalog()
      ]);
      setPolicy(p);
      setCatalog(c);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (error || !policy) return <div className="p-8 text-red-500">{error || 'Not found'}</div>;

  const version = policy.versions?.find(v => v.id === versionId);
  if (!version) return <div className="p-8 text-red-500">Version not found</div>;

  const handleSave = async (rules) => {
    try {
      await platformPoliciesApi.updateVersionRules(versionId, version.version, rules);
      navigate(`/admin-master/platform-policies/${policyId}`);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update rules');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Rules: {policy.name}</h1>
          <p className="text-sm text-gray-500 font-mono mt-1">Version: {version.versionNumber}</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/admin-master/platform-policies/${policyId}`)}>
          Back to Details
        </Button>
      </div>

      <PolicyRulesEditor 
        initialRules={version.rules || []}
        catalog={catalog}
        onSave={handleSave}
      />
    </div>
  );
}
