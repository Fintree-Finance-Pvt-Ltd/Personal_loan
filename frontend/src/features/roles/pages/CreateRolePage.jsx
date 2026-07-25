import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui';
import { RoleForm } from '../components/RoleForm';
import { createRole } from '../api/roles.api';

export function CreateRolePage() {
  const navigate = useNavigate();

  useEffect(() => { document.title = 'Create Role — Admin Panel'; }, []);

  const handleSubmit = async (values) => {
    const created = await createRole(values);
    navigate(`/admin-master/roles/${created.id}`, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Create role" description="Define a new custom role and assign initial permissions." />
      <RoleForm onSubmit={handleSubmit} submitLabel="Create role" />
    </div>
  );
}
