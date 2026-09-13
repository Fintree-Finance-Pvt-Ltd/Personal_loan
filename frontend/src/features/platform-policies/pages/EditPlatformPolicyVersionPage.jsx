import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { platformPoliciesApi } from '../api/platform-policies.api';
import { Alert, Button, PageHeader, Spinner } from '../../../components/ui';
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

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading policy…" />
      </div>
    );
  }

  if (error || !policy) {
    return <Alert>{error || 'Policy not found.'}</Alert>;
  }

  const version = policy.versions?.find(v => v.id === versionId);
  if (!version) return <Alert>Version not found.</Alert>;

  const handleSave = async (rules) => {
    try {
      await platformPoliciesApi.updateVersionRules(versionId, version.version, rules);
      navigate(`/admin-master/platform-policies/${policyId}`);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update rules');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title={`Edit rules: ${policy.name}`}
        description={`Version ${version.versionNumber}`}
        actions={
          <Button variant="secondary" onClick={() => navigate(`/admin-master/platform-policies/${policyId}`)}>
            <ArrowLeft size={15} /> Back to details
          </Button>
        }
      />

      <PolicyRulesEditor
        initialRules={version.rules || []}
        catalog={catalog}
        onSave={handleSave}
      />
    </div>
  );
}
