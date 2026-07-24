import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, Badge } from './ui';
import { PermissionGate } from './ProtectedRoute';

export function AdminLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    await auth.logout();
    navigate('/admin-master/login', { replace: true });
  };
  const navClass = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-700 font-bold text-white">PL</div>
            <div><p className="font-bold text-ink">Personal Loan Platform</p><p className="text-xs text-slate-500">Secure administration</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block"><p className="text-sm font-semibold">{auth.user?.name}</p><p className="text-xs text-slate-500">{auth.user?.email}</p></div>
            <Button variant="secondary" onClick={handleLogout}>Logout</Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr]">
        <aside>
          <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 lg:flex-col" aria-label="Admin navigation">
            <PermissionGate permission="ADMIN_DASHBOARD_VIEW"><NavLink className={navClass} to="/admin-master/dashboard">Dashboard</NavLink></PermissionGate>
            <PermissionGate permission="SESSION_READ_OWN"><NavLink className={navClass} to="/admin-master/sessions">Sessions</NavLink></PermissionGate>
          </nav>
          <div className="mt-4 hidden rounded-xl border border-slate-200 bg-white p-4 lg:block">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active roles</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{auth.roleCodes.map((role) => <Badge key={role}>{role}</Badge>)}</div>
          </div>
        </aside>
        <main><Outlet /></main>
      </div>
    </div>
  );
}
