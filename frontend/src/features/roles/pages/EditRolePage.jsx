import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, PageHeader, Spinner } from '../../../components/ui';
import { RoleForm } from '../components/RoleForm';
import { getRole, updateRole, replaceRolePermissions } from '../api/roles.api';
import { apiError } from '../../../lib/api';

export function EditRolePage() {
  const { roleId } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Edit Role — Admin Panel'; }, []);

  useEffect(() => {
    const controller = new AbortController();
    getRole(roleId, controller.signal)
      .then(setRole)
      .catch(err => { if (err.name !== 'CanceledError') setError(apiError(err, 'Failed to load role.')); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [roleId]);

  const handleSubmit = async ({ permissionIds, name, description }) => {
    await Promise.all([
      updateRole(roleId, { name, description }),
      replaceRolePermissions(roleId, permissionIds),
    ]);
    navigate(`/admin-master/roles/${roleId}`, { replace: true });
  };

  if (loading) return <div className="flex justify-center py-16 text-brand-700"><Spinner label="Loading role" /></div>;
  if (error) return <Alert>{error}</Alert>;
  if (!role) return null;

  return (
    <div>
      <PageHeader title={`Edit: ${role.name}`} description="Update role details and permission assignments." />
      <RoleForm initialValues={role} onSubmit={handleSubmit} submitLabel="Save changes" isEdit />
    </div>
  );
}
