import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  KeyRound,
  Laptop,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { api } from '../../../lib/api';
import { Badge, Card, PageHeader, StatCard } from '../../../components/ui';

const controls = [
  { icon: KeyRound, title: 'Access tokens', text: 'Short-lived and memory-only' },
  { icon: ShieldCheck, title: 'Session tokens', text: 'Opaque, HttpOnly, rotating' },
  { icon: Laptop, title: 'Authorization', text: 'Exact backend permissions' },
  { icon: ScrollText, title: 'Audit records', text: 'Sanitized and HMAC-protected' },
];

export function DashboardPage() {
  const auth = useAuth();
  const [currentSession, setCurrentSession] = useState(null);
  useEffect(() => {
    api.get('/auth/admin/sessions').then(({ data }) => setCurrentSession(data.data.find((item) => item.isCurrent))).catch(() => {});
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome, ${auth.user?.name}`}
        description="Phase 1 administration and security overview"
        actions={
          <Link
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-neutral-300 px-4 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50"
            to="/admin-master/sessions"
          >
            Manage sessions →
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {controls.map(({ icon, title, text }) => (
          <StatCard key={title} icon={icon} label={title} value={text} tone="brand" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="font-display text-[15px] font-bold text-ink">Administrator profile</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-neutral-500">Name</dt><dd className="font-semibold text-ink">{auth.user?.name}</dd></div>
            <div><dt className="text-sm text-neutral-500">Email</dt><dd className="break-all font-semibold text-ink">{auth.user?.email}</dd></div>
          </dl>
          <p className="mt-5 text-sm font-semibold text-neutral-500">Assigned roles</p>
          <div className="mt-2 flex flex-wrap gap-2">{auth.roleCodes.map((role) => <Badge key={role} tone="brand">{role}</Badge>)}</div>
        </Card>
        <Card>
          <h2 className="font-display text-[15px] font-bold text-ink">Current session</h2>
          {currentSession ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                <dt className="flex items-center gap-2 text-neutral-500"><Laptop size={14} /> Device</dt>
                <dd className="font-semibold text-ink">{currentSession.deviceLabel}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                <dt className="text-neutral-500">Network</dt>
                <dd className="font-numeric font-semibold text-ink">{currentSession.ipAddress || 'Unavailable'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-neutral-500"><Clock size={14} /> Last active</dt>
                <dd className="font-semibold text-ink">{new Date(currentSession.lastSeenAt).toLocaleString()}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">Session details are loading.</p>
          )}
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="font-display text-[15px] font-bold text-ink">Permission summary</h2>
        <p className="mt-1 text-sm text-neutral-500">{auth.permissionCodes.length} exact permission codes assigned through active roles.</p>
        <div className="mt-4 flex flex-wrap gap-2">{auth.permissionCodes.map((permission) => <Badge tone="neutral" key={permission}>{permission}</Badge>)}</div>
      </Card>
    </>
  );
}
