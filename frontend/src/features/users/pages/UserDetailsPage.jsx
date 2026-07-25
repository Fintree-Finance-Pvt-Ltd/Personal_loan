import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, PageHeader, Spinner } from '../../../components/ui';
import { ConfirmationDialog } from '../../../components/ConfirmationDialog';
import { UserStatusBadge } from '../components/UserStatusBadge';
import { AssignRolesDialog } from '../components/AssignRolesDialog';
import { DisableUserDialog } from '../components/DisableUserDialog';
import { PermissionGate } from '../../../components/ProtectedRoute';
import { getUser, activateUser, disableUser, revokeUserSessions, replaceUserRoles } from '../api/users.api';
import { useAuth } from '../../../auth/AuthContext';
import { apiError } from '../../../lib/api';

function formatDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function UserDetailsPage() {
  const { userId } = useParams();
  const currentUser = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // 'activate' | 'revoke' | 'disable' | 'roles'
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState('');

  useEffect(() => { document.title = 'User Details — Admin Panel'; }, []);

  const fetchUser = () => {
    setLoading(true); setError('');
    getUser(userId)
      .then(setUser)
      .catch(err => setError(apiError(err, 'Failed to load user.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUser(); }, [userId]);

  const isSelf = currentUser.userId === userId;

  const runAction = async (action) => {
    setBusy(true); setActionErr('');
    try {
      if (action === 'activate') await activateUser(userId);
      else if (action === 'disable') await disableUser(userId);
      else if (action === 'revoke') await revokeUserSessions(userId);
      setDialog(null);
      fetchUser();
    } catch (err) {
      setActionErr(apiError(err, 'Action failed.'));
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const handleAssignRoles = async (roleIds) => {
    setBusy(true); setActionErr('');
    try {
      await replaceUserRoles(userId, roleIds);
      setDialog(null);
      fetchUser();
    } catch (err) {
      setActionErr(apiError(err, 'Failed to update roles.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16 text-brand-700"><Spinner label="Loading" /></div>;
  if (error) return <Alert>{error}</Alert>;
  if (!user) return null;

  return (
    <div>
      <PageHeader
        title={user.name}
        description={user.email}
        actions={
          <div className="flex flex-wrap gap-3">
            <PermissionGate permission="USER_UPDATE">
              <Link to={`/admin-master/users/${userId}/edit`}><Button variant="secondary">Edit</Button></Link>
              {user.status !== 'ACTIVE' && (
                <Button onClick={() => setDialog('activate')}>Activate</Button>
              )}
            </PermissionGate>
            <PermissionGate permission="ROLE_ASSIGN">
              <Button variant="secondary" onClick={() => setDialog('roles')}>Assign roles</Button>
            </PermissionGate>
            <PermissionGate permission="SESSION_REVOKE_ALL">
              <Button variant="secondary" onClick={() => setDialog('revoke')}>Revoke sessions</Button>
            </PermissionGate>
            <PermissionGate permission="USER_DISABLE">
              {!isSelf && user.status !== 'DISABLED' && (
                <Button variant="danger" onClick={() => setDialog('disable')}>Disable</Button>
              )}
            </PermissionGate>
          </div>
        }
      />

      {actionErr && <Alert className="mb-4">{actionErr}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { label: 'Status', value: <UserStatusBadge status={user.status} /> },
          { label: 'Last login', value: formatDate(user.lastLoginAt) },
          { label: 'Active sessions', value: user.activeSessionCount ?? '—' },
          { label: 'Failed logins', value: user.failedLoginCount },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <div className="mt-2 text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {user.lockedUntil && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Account locked until {formatDate(user.lockedUntil)}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Assigned roles</h2>
          {user.roles.length === 0 ? (
            <p className="text-sm text-slate-400">No roles assigned.</p>
          ) : (
            <div className="space-y-2">
              {user.roles.map(r => (
                <div key={r.code} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <div>
                    <p className="font-semibold text-sm text-slate-900">{r.name}</p>
                    <p className="font-mono text-xs text-slate-400">{r.code}</p>
                  </div>
                  <Badge tone={r.status === 'ACTIVE' ? 'brand' : 'neutral'}>{r.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-semibold text-slate-800">
            Effective permissions <span className="text-sm font-normal text-slate-500">({user.effectivePermissions?.length ?? 0})</span>
          </h2>
          <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
            {user.effectivePermissions?.length === 0 && <p className="text-sm text-slate-400">No effective permissions.</p>}
            {user.effectivePermissions?.map(code => (
              <span key={code} className="rounded-full bg-brand-50 px-2.5 py-1 font-mono text-xs text-brand-700">{code}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-400 grid grid-cols-2 gap-3">
        <div><span className="font-semibold text-slate-600">Created: </span>{formatDate(user.createdAt)}</div>
        <div><span className="font-semibold text-slate-600">Updated: </span>{formatDate(user.updatedAt)}</div>
      </div>

      <ConfirmationDialog
        open={dialog === 'activate'}
        title="Activate user?"
        description={`This will set ${user.name}'s account to ACTIVE and clear any lock.`}
        confirmLabel="Activate"
        confirmVariant="primary"
        busy={busy}
        onConfirm={() => runAction('activate')}
        onCancel={() => setDialog(null)}
      />
      <ConfirmationDialog
        open={dialog === 'revoke'}
        title="Revoke all sessions?"
        description={`This will immediately terminate all active sessions for ${user.name}.`}
        confirmLabel="Revoke sessions"
        confirmVariant="danger"
        busy={busy}
        onConfirm={() => runAction('revoke')}
        onCancel={() => setDialog(null)}
      />
      <DisableUserDialog
        open={dialog === 'disable'}
        userName={user.name}
        busy={busy}
        onConfirm={() => runAction('disable')}
        onCancel={() => setDialog(null)}
      />
      <AssignRolesDialog
        open={dialog === 'roles'}
        currentRoleIds={user.roles.map(r => r.id)}
        busy={busy}
        onConfirm={handleAssignRoles}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
