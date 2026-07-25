import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui';
import { apiError } from '../../../lib/api';
import { createLender } from '../api/lenders.api';
import { LenderForm } from '../components/LenderForm';

export function CreateLenderPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Add lender — Personal Loan Platform';
  }, []);

  const handleSubmit = async (payload) => {
    setBusy(true);
    setError('');

    try {
      const lender = await createLender(payload);
      navigate(`/admin-master/lenders/${lender.id}`, {
        replace: true,
        state: { message: 'Lender created successfully as Draft.' },
      });
    } catch (requestError) {
      setError(apiError(requestError, 'Unable to create lender. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Add lender"
        description="Create a new lending partner as a Draft configuration."
      />

      <LenderForm
        submitLabel="Create lender"
        busy={busy}
        serverError={error}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/admin-master/lenders')}
      />
    </>
  );
}
