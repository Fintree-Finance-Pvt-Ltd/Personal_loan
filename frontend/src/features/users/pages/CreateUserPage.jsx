import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Input, PageHeader, PasswordInput, Spinner } from '../../../components/ui';
import { createUser } from '../api/users.api';
import { getRoles } from '../../roles/api/roles.api';
import { createUserSchema } from '../validation/user.schema';
import { apiError } from '../../../lib/api';

export function CreateUserPage() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [apiErr, setApiErr] = useState('');

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '', roleIds: [] },
  });

  useEffect(() => { document.title = 'Create User — Admin Panel'; }, []);

  useEffect(() => {
    getRoles({ status: 'ACTIVE', limit: 100 })
      .then(data => setRoles(data.items))
      .catch(() => {})
      .finally(() => setRolesLoading(false));
  }, []);

  const submit = async ({ confirmPassword, ...values }) => {
    setApiErr('');
    try {
      const created = await createUser(values);
      navigate(`/admin-master/users/${created.id}`, { replace: true });
    } catch (err) {
      setApiErr(apiError(err, 'Failed to create user.'));
    }
  };

  return (
    <div>
      <PageHeader title="Create user" description="Add a new administrator account and assign roles." />
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-6">
        {apiErr && <Alert>{apiErr}</Alert>}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <h2 className="font-semibold text-slate-800">Account details</h2>
          <Input label="Full name" placeholder="e.g. Configuration Maker" error={errors.name?.message} {...register('name')} />
          <Input label="Email address" type="email" autoComplete="off" placeholder="user@example.com" error={errors.email?.message} {...register('email')} />
          <PasswordInput label="Temporary password" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
          <PasswordInput label="Confirm password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Assign roles</h2>
          {rolesLoading ? (
            <div className="flex justify-center py-8 text-brand-700"><Spinner label="Loading roles" /></div>
          ) : (
            <Controller
              name="roleIds"
              control={control}
              render={({ field }) => (
                <div className="space-y-2">
                  {roles.map(role => (
                    <label key={role.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        value={role.id}
                        checked={field.value.includes(role.id)}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...field.value, role.id]
                            : field.value.filter(id => id !== role.id);
                          field.onChange(next);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                      <div>
                        <p className="font-semibold text-sm text-slate-900">{role.name}</p>
                        <p className="font-mono text-xs text-slate-400">{role.code}</p>
                      </div>
                    </label>
                  ))}
                  {errors.roleIds?.message && (
                    <p className="mt-1 text-sm text-red-700">{errors.roleIds.message}</p>
                  )}
                </div>
              )}
            />
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner label="Creating" /> : 'Create user'}
          </Button>
        </div>
      </form>
    </div>
  );
}
