import { useEffect, useState } from 'react';
import {
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ADMIN_NAVIGATION } from '../config/adminNavigation';

function NavigationLink({ item, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition',
          isActive
            ? 'bg-white/10 text-white'
            : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400" />
          )}
          <span
            className={[
              'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition',
              isActive ? 'bg-brand-500/20 text-brand-300' : 'bg-white/5 text-neutral-400 group-hover:text-neutral-200',
            ].join(' ')}
          >
            {Icon ? <Icon size={16} strokeWidth={2} /> : item.shortLabel}
          </span>
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ auth, onNavigate }) {
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
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-500 font-display text-sm font-extrabold text-white">
          PL
        </div>

        <div className="min-w-0">
          <p className="font-display truncate font-bold text-white">
            Personal Loan
          </p>
          <p className="text-xs font-medium text-neutral-400">
            Superadmin console
          </p>
        </div>
      </div>

      <nav
        className="flex-1 space-y-6 overflow-y-auto px-3 py-5"
        aria-label="Admin navigation"
      >
        {visibleGroups.map((navigationGroup) => (
          <div key={navigationGroup.group}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">
              {navigationGroup.group}
            </p>

            <div className="space-y-0.5">
              {navigationGroup.items.map((item) => (
                <NavigationLink
                  key={item.path}
                  item={item}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">
          Active roles
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {auth.roleCodes.map((role) => (
            <span
              key={role}
              className="inline-flex rounded-lg bg-white/5 px-2.5 py-1 text-xs font-bold text-neutral-300"
            >
              {role}
            </span>
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

  const currentPage = ADMIN_NAVIGATION.flatMap((group) => group.items).find(
    (item) => item.path === location.pathname,
  );

  const initials =
    auth.user?.name
      ?.split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase() || 'AD';

  return (
    <div className="admin-app min-h-screen bg-neutral-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink lg:flex">
        <SidebarContent auth={auth} />
      </aside>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-neutral-950/50"
            onClick={() =>
              setMobileSidebarOpen(false)
            }
          />

          <aside className="relative flex h-full w-72 flex-col bg-ink shadow-2xl">
            <div className="flex justify-end px-4 pt-4">
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileSidebarOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <SidebarContent
              auth={auth}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Open navigation"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-neutral-200 text-neutral-600 lg:hidden"
                onClick={() =>
                  setMobileSidebarOpen(true)
                }
              >
                <Menu size={18} />
              </button>

              <div className="min-w-0">
                <p className="font-display truncate text-[15px] font-bold text-ink">
                  {currentPage?.label || 'Superadmin Panel'}
                </p>
                <p className="hidden truncate text-xs text-neutral-500 sm:block">
                  Configuration and platform monitoring
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-ink">
                  {auth.user?.name}
                </p>
                <p className="max-w-56 truncate text-xs text-neutral-500">
                  {auth.user?.email}
                </p>
              </div>

              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-extrabold text-brand-700">
                {initials}
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="hidden h-9 shrink-0 items-center gap-1.5 rounded-lg border border-neutral-300 px-3 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50 sm:inline-flex"
              >
                <LogOut size={15} />
                Logout
              </button>
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
