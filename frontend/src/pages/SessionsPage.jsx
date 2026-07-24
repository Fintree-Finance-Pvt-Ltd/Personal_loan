import { useCallback, useEffect, useState } from 'react';
import { api, apiError } from '../lib/api';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '../components/ui';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { PermissionGate } from '../components/ProtectedRoute';

export function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/auth/admin/sessions');
      setSessions(data.data);
      setError('');
    } catch (requestError) {
      setError(apiError(requestError));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const confirm = async () => {
    setBusy(true);
    try {
      if (dialog.type === 'others') await api.post('/auth/admin/sessions/revoke-others');
      else await api.delete(`/auth/admin/sessions/${dialog.sessionId}`);
      setDialog(null);
      await load();
    } catch (requestError) {
      setError(apiError(requestError));
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Session management"
        description="Review and revoke browser sessions tied to your account."
        actions={<PermissionGate permission="SESSION_REVOKE_ALL"><Button variant="secondary" onClick={() => setDialog({ type: 'others' })}>Revoke other sessions</Button></PermissionGate>}
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {loading ? <Card><Spinner label="Loading sessions" /></Card> : sessions.length === 0 ? <Card><p className="text-slate-600">No session records are available.</p></Card> : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <Card key={session.id} className={session.isCurrent ? 'border-brand-500' : ''}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-ink">{session.deviceLabel || 'Unknown device'}</h2>{session.isCurrent && <Badge>Current session</Badge>}{session.revokedAt && <Badge tone="neutral">Revoked</Badge>}</div>
                  <p className="mt-1 text-sm text-slate-500">Network: {session.ipAddress || 'Unavailable'}</p>
                </div>
                {!session.revokedAt && <PermissionGate permission="SESSION_REVOKE_OWN"><Button variant="danger" onClick={() => setDialog({ type: 'one', sessionId: session.id, current: session.isCurrent })}>Revoke</Button></PermissionGate>}
              </div>
              <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
                <div><dt className="text-slate-500">Created</dt><dd className="mt-1 font-medium">{new Date(session.createdAt).toLocaleString()}</dd></div>
                <div><dt className="text-slate-500">Last active</dt><dd className="mt-1 font-medium">{new Date(session.lastSeenAt).toLocaleString()}</dd></div>
                <div><dt className="text-slate-500">Absolute expiry</dt><dd className="mt-1 font-medium">{new Date(session.absoluteExpiresAt).toLocaleString()}</dd></div>
              </dl>
            </Card>
          ))}
        </div>
      )}
      <ConfirmationDialog
        open={Boolean(dialog)}
        title={dialog?.type === 'others' ? 'Revoke all other sessions?' : 'Revoke this session?'}
        description={dialog?.current ? 'This is your current session. Revoking it will end access as soon as the next request is made.' : 'The selected session will lose access immediately. This action cannot be undone.'}
        confirmLabel="Revoke session"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
