import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Input, Spinner } from '../../../components/ui';
import { PermissionSelector } from './PermissionSelector';
import { getPermissions } from '../../permissions/api/permissions.api';
import { apiError } from '../../../lib/api';
import { createRoleSchema, updateRoleSchema } from '../validation/role.schema';

export function RoleForm({ initialValues, onSubmit, submitLabel = 'Save', isEdit = false }) {
  const navigate = useNavigate();
  const [allPermissions, setAllPermissions] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState(
    initialValues?.permissionIds ?? (initialValues?.permissions?.map(p => p.id) ?? []),
  );
  const [apiErr, setApiErr] = useState('');

  const schema = isEdit ? updateRoleSchema : createRoleSchema;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialValues?.name ?? '',
      code: initialValues?.code ?? '',
      description: initialValues?.description ?? '',
    },
  });

  useEffect(() => {
    getPermissions()
      .then(data => setAllPermissions(data.items))
      .catch(() => {})
      .finally(() => setPermissionsLoading(false));
  }, []);

  const submit = async (values) => {
    setApiErr('');
    try {
      await onSubmit({ ...values, permissionIds: selectedPermissionIds });
    } catch (err) {
      setApiErr(apiError(err, 'Failed to save role.'));
    }
  };

  const isSuperadmin = initialValues?.code === 'SUPERADMIN';

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-6">
      {apiErr && <Alert>{apiErr}</Alert>}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
        <h2 className="font-semibold text-slate-800">Role Details</h2>
        <Input
          label="Role name"
          placeholder="e.g. Credit Risk Analyst"
          error={errors.name?.message}
          {...register('name')}
        />
        <div>
          <Input
            label="Role code"
            placeholder="e.g. CREDIT_RISK_ANALYST"
            error={errors.code?.message}
            disabled={isEdit || initialValues?.isSystem}
            {...register('code')}
          />
          {isEdit && (
            <p className="mt-1.5 text-xs text-slate-500">Role codes are immutable after creation.</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Description
            <textarea
              rows={2}
              placeholder="Optional description of the role's purpose…"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600"
              {...register('description')}
            />
            {errors.description?.message && (
              <span className="mt-1.5 block text-sm text-red-700">{errors.description.message}</span>
            )}
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Permissions</h2>
          {isSuperadmin && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
              SUPERADMIN permissions cannot be modified
            </span>
          )}
        </div>
        {permissionsLoading ? (
          <div className="flex justify-center py-8 text-brand-700"><Spinner label="Loading permissions" /></div>
        ) : (
          <PermissionSelector
            allPermissions={allPermissions}
            selectedIds={selectedPermissionIds}
            onChange={setSelectedPermissionIds}
            disabled={isSuperadmin}
          />
        )}
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner label="Saving" /> : submitLabel}
        </Button>
      </div>
    </form>
  );
}
