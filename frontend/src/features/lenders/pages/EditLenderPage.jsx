import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Alert, Card, PageHeader, Spinner } from '../../../components/ui';
import { apiError } from '../../../lib/api';
import { getLender, updateLender } from '../api/lenders.api';
import { LenderForm } from '../components/LenderForm';

export function EditLenderPage() {
  const { lenderId } = useParams();
  const navigate = useNavigate();
  const [lender, setLender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Edit lender — Personal Loan Platform';
    const controller = new AbortController();

    getLender(lenderId, controller.signal)
      .then(setLender)
      .catch((requestError) => {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(apiError(requestError, 'Unable to load lender.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [lenderId]);

  const handleSubmit = async (payload) => {
    setBusy(true);
    setError('');

    try {
      const updated = await updateLender(lenderId, payload);
      navigate(`/admin-master/lenders/${updated.id}`, {
        replace: true,
        state: { message: 'Lender updated successfully.' },
      });
    } catch (requestError) {
      setError(apiError(requestError, 'Unable to update lender. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card className="grid min-h-64 place-items-center text-brand-700">
        <Spinner label="Loading lender" />
      </Card>
    );
  }

  if (!lender) {
    return (
      <>
        <PageHeader title="Edit lender" description="The lender could not be loaded." />
        <Alert>{error || 'Lender not found.'}</Alert>
      </>
    );
  }

  if (!['DRAFT', 'REJECTED'].includes(lender.approvalStatus)) {
    return <Navigate to={`/admin-master/lenders/${lenderId}`} replace />;
  }

  return (
    <>
      <PageHeader
        title={`Edit ${lender.displayName}`}
        description="Only Draft and Rejected lenders can be changed."
      />

      <LenderForm
        defaultValues={lender}
        submitLabel="Save changes"
        busy={busy}
        serverError={error}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/admin-master/lenders/${lenderId}`)}
      />
    </>
  );
}
