import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Input, PageHeader, Spinner } from '../../../components/ui';
import { getUser, updateUser } from '../api/users.api';
import { updateUserSchema } from '../validation/user.schema';
import { apiError } from '../../../lib/api';

export function EditUserPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [apiErr, setApiErr] = useState('');

  useEffect(() => { document.title = 'Edit User — Admin Panel'; }, []);

  useEffect(() => {
    const controller = new AbortController();
    getUser(userId, controller.signal)
      .then(setUser)
      .catch(err => { if (err.name !== 'CanceledError') setLoadError(apiError(err, 'Failed to load user.')); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [userId]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(updateUserSchema),
    values: user ? { name: user.name, email: user.email } : {},
  });

  const submit = async (values) => {
    setApiErr('');
    try {
      await updateUser(userId, values);
      navigate(`/admin-master/users/${userId}`, { replace: true });
    } catch (err) {
      setApiErr(apiError(err, 'Failed to update user.'));
    }
  };

  if (loading) return <div className="flex justify-center py-16 text-brand-700"><Spinner label="Loading user" /></div>;
  if (loadError) return <Alert>{loadError}</Alert>;
  if (!user) return null;

  return (
    <div>
      <PageHeader title={`Edit: ${user?.name}`} description="Update name or email address for this user." />
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-6 max-w-lg">
        {apiErr && <Alert>{apiErr}</Alert>}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <Input label="Full name" error={errors.name?.message} {...register('name')} />
          <Input label="Email address" type="email" error={errors.email?.message} {...register('email')} />
          <p className="text-xs text-slate-400">
            Password and roles cannot be updated here. Use the user details page for role assignment or contact security for password resets.
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner label="Saving" /> : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
