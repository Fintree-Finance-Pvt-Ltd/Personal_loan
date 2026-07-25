import { useEffect, useState } from 'react';
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ADMIN_NAVIGATION } from '../config/adminNavigation';
import { Badge, Button } from './ui';

function NavigationLink({ item }) {
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        [
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
          isActive
            ? 'bg-brand-50 text-brand-700'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        ].join(' ')
      }
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600 group-hover:bg-white">
        {item.shortLabel}
      </span>

      <span>{item.label}</span>
    </NavLink>
  );
}

function SidebarContent({ auth }) {
  const visibleGroups = ADMIN_NAVIGATION.map(
    (navigationGroup) => ({
      ...navigationGroup,
      items: navigationGroup.items.filter((item) =>
        auth.hasPermission(item.permission),
      ),
    }),
  ).filter(
    (navigationGroup) =>
      navigationGroup.items.length > 0,
  );

  return (
    <>
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-5">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-700 font-bold text-white">
          PL
        </div>

        <div>
          <p className="font-bold text-ink">
            Personal Loan
          </p>
          <p className="text-xs text-slate-500">
            Superadmin
          </p>
        </div>
      </div>

      <nav
        className="flex-1 space-y-6 overflow-y-auto px-3 py-5"
        aria-label="Admin navigation"
      >
        {visibleGroups.map((navigationGroup) => (
          <div key={navigationGroup.group}>
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              {navigationGroup.group}
            </p>

            <div className="space-y-1">
              {navigationGroup.items.map((item) => (
                <NavigationLink
                  key={item.path}
                  item={item}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Active roles
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {auth.roleCodes.map((role) => (
            <Badge key={role} tone="neutral">
              {role}
            </Badge>
          ))}
        </div>
      </div>
    </>
  );
}

export function AdminLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] =
    useState(false);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await auth.logout();

    navigate('/admin-master/login', {
      replace: true,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <SidebarContent auth={auth} />
      </aside>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/45"
            onClick={() =>
              setMobileSidebarOpen(false)
            }
          />

          <aside className="relative flex h-full w-72 flex-col bg-white shadow-2xl">
            <SidebarContent auth={auth} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Open navigation"
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-lg text-slate-700 lg:hidden"
                onClick={() =>
                  setMobileSidebarOpen(true)
                }
              >
                ☰
              </button>

              <div>
                <p className="text-sm font-bold text-ink">
                  Superadmin Panel
                </p>
                <p className="hidden text-xs text-slate-500 sm:block">
                  Configuration and platform monitoring
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-ink">
                  {auth.user?.name}
                </p>
                <p className="max-w-56 truncate text-xs text-slate-500">
                  {auth.user?.email}
                </p>
              </div>

              <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                {auth.user?.name
                  ?.split(/\s+/)
                  .slice(0, 2)
                  .map((word) => word.charAt(0))
                  .join('')
                  .toUpperCase() || 'AD'}
              </div>

              <Button
                type="button"
                variant="secondary"
                className="hidden sm:inline-flex"
                onClick={handleLogout}
              >
                Logout
              </Button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}