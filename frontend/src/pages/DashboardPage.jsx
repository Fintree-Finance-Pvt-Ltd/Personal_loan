import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Badge, Card, PageHeader } from '../components/ui';

const controls = [
  ['Access tokens', 'Short-lived and memory-only'],
  ['Session tokens', 'Opaque, HttpOnly, rotating'],
  ['Authorization', 'Exact backend permissions'],
  ['Audit records', 'Sanitized and HMAC-protected'],
];

export function DashboardPage() {
  const auth = useAuth();
  const [currentSession, setCurrentSession] = useState(null);
  useEffect(() => {
    api.get('/auth/admin/sessions').then(({ data }) => setCurrentSession(data.data.find((item) => item.isCurrent))).catch(() => {});
  }, []);
  return (
    <>
      <PageHeader title={`Welcome, ${auth.user?.name}`} description="Phase 1 administration and security overview" actions={<Link className="font-semibold text-brand-700 hover:underline" to="/admin-master/sessions">Manage sessions →</Link>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {controls.map(([title, text]) => <Card key={title}><p className="text-sm font-semibold text-slate-500">{title}</p><p className="mt-3 text-lg font-bold text-ink">{text}</p><div className="mt-4 h-1.5 rounded-full bg-brand-100"><div className="h-full w-full rounded-full bg-brand-600" /></div></Card>)}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-ink">Administrator profile</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-slate-500">Name</dt><dd className="font-semibold">{auth.user?.name}</dd></div>
            <div><dt className="text-sm text-slate-500">Email</dt><dd className="break-all font-semibold">{auth.user?.email}</dd></div>
          </dl>
          <p className="mt-5 text-sm font-semibold text-slate-500">Assigned roles</p>
          <div className="mt-2 flex flex-wrap gap-2">{auth.roleCodes.map((role) => <Badge key={role}>{role}</Badge>)}</div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-ink">Current session</h2>
          {currentSession ? <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Device</dt><dd className="font-semibold">{currentSession.deviceLabel}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Network</dt><dd className="font-semibold">{currentSession.ipAddress || 'Unavailable'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Last active</dt><dd className="font-semibold">{new Date(currentSession.lastSeenAt).toLocaleString()}</dd></div>
          </dl> : <p className="mt-4 text-sm text-slate-500">Session details are loading.</p>}
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="text-lg font-bold text-ink">Permission summary</h2>
        <p className="mt-1 text-sm text-slate-500">{auth.permissionCodes.length} exact permission codes assigned through active roles.</p>
        <div className="mt-4 flex flex-wrap gap-2">{auth.permissionCodes.map((permission) => <Badge tone="neutral" key={permission}>{permission}</Badge>)}</div>
      </Card>
    </>
  );
}
