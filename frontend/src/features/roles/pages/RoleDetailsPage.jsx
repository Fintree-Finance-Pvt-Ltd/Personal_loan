import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, PageHeader, Spinner } from '../../../components/ui';
import { ConfirmationDialog } from '../../../components/ConfirmationDialog';
import { RoleStatusBadge } from '../components/RoleStatusBadge';
import { PermissionGate } from '../../../components/ProtectedRoute';
import { getRole, activateRole, deactivateRole } from '../api/roles.api';
import { apiError } from '../../../lib/api';

export function RoleDetailsPage() {
  const { roleId } = useParams();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // 'activate' | 'deactivate'
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = 'Role Details — Admin Panel'; }, []);

  const fetchRole = () => {
    setLoading(true); setError('');
    getRole(roleId)
      .then(setRole)
      .catch(err => setError(apiError(err, 'Failed to load role.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRole(); }, [roleId]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      if (confirm === 'activate') await activateRole(roleId);
      else await deactivateRole(roleId);
      setConfirm(null);
      fetchRole();
    } catch (err) {
      setError(apiError(err, 'Action failed.'));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16 text-brand-700"><Spinner label="Loading" /></div>;
  if (error) return <Alert>{error}</Alert>;
  if (!role) return null;

  const grouped = {};
  for (const perm of role.permissions ?? []) {
    if (!grouped[perm.module]) grouped[perm.module] = [];
    grouped[perm.module].push(perm);
  }

  return (
    <div>
      <PageHeader
        title={role.name}
        description={role.description || '—'}
        actions={
          <div className="flex gap-3">
            <PermissionGate permission="ROLE_UPDATE">
              {role.code !== 'SUPERADMIN' && (
                <Link to={`/admin-master/roles/${roleId}/edit`}>
                  <Button variant="secondary">Edit</Button>
                </Link>
              )}
              {role.status === 'ACTIVE' && role.code !== 'SUPERADMIN' && (
                <Button variant="danger" onClick={() => setConfirm('deactivate')}>Deactivate</Button>
              )}
              {role.status === 'INACTIVE' && (
                <Button onClick={() => setConfirm('activate')}>Activate</Button>
              )}
            </PermissionGate>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Code</p>
          <p className="mt-1 font-mono text-lg text-slate-900">{role.code}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</p>
          <div className="mt-2"><RoleStatusBadge status={role.status} /></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Type</p>
          <div className="mt-2"><Badge tone={role.isSystem ? 'brand' : 'neutral'}>{role.isSystem ? 'System' : 'Custom'}</Badge></div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-slate-800">
          Permissions <span className="ml-2 text-sm font-normal text-slate-500">({role.permissions?.length ?? 0})</span>
        </h2>
        {Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-slate-400">No permissions assigned.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).sort().map(([module, perms]) => (
              <div key={module}>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">{module}</p>
                <div className="flex flex-wrap gap-1.5">
                  {perms.map(p => (
                    <span key={p.id} className="rounded-full bg-brand-50 px-2.5 py-1 font-mono text-xs text-brand-700">{p.code}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={confirm !== null}
        title={confirm === 'deactivate' ? 'Deactivate role?' : 'Activate role?'}
        description={confirm === 'deactivate'
          ? `Deactivating "${role.name}" will revoke its permissions from all assigned users immediately.`
          : `Activating "${role.name}" will restore its permissions for all assigned users.`}
        confirmLabel={confirm === 'deactivate' ? 'Deactivate' : 'Activate'}
        confirmVariant={confirm === 'deactivate' ? 'danger' : 'primary'}
        busy={busy}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
