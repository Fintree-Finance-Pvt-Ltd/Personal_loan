import {
  FileText,
  HelpCircle,
  Home,
  LogOut,
  User,
  WalletCards,
  X,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

const menuItems = [
  {
    label: 'Dashboard',
    path: '/customer/dashboard',
    icon: Home,
  },
  {
    label: 'My Application',
    path: '/customer/application',
    icon: FileText,
  },
  {
    label: 'Loan Details',
    path: '/customer/loan-details',
    icon: WalletCards,
  },
  {
    label: 'My Profile',
    path: '/customer/profile',
    icon: User,
  },
  {
    label: 'Help & Support',
    path: '/customer/support',
    icon: HelpCircle,
  },
];

export default function CustomerSidebar({
  isOpen,
  onClose,
}) {
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.removeItem('customerSession');

    navigate('/customer/login', {
      replace: true,
    });
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar logo */}
        <div className="flex h-20 items-center justify-between border-b border-slate-200 px-6">
          <button
            type="button"
            onClick={() => navigate('/customer/dashboard')}
            className="flex items-center gap-3"
          >
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-600 text-sm font-bold text-white shadow-lg shadow-emerald-600/20">
              FL
            </div>

            <div className="text-left">
              <p className="text-xl font-extrabold tracking-tight text-slate-900">
                FinLeaf
              </p>

              <p className="text-[10px] font-medium text-slate-500">
                Fintree Finance Pvt. Ltd.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Close menu"
          >
            <X size={21} />
          </button>
        </div>

        {/* Customer card */}
        <div className="px-5 py-5">
          <div className="rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-500 p-4 text-white shadow-lg shadow-emerald-600/15">
            <p className="text-xs font-medium text-emerald-100">
              Customer Portal
            </p>

            <p className="mt-1 text-base font-bold">
              Welcome back
            </p>

            <p className="mt-1 text-xs text-emerald-50">
              Complete your loan journey securely.
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 pb-4">
          <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
            Main Menu
          </p>

          <div className="space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`grid h-9 w-9 place-items-center rounded-lg ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Icon size={18} />
                      </span>

                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>

        {/* Logout */}
        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-red-50">
              <LogOut size={18} />
            </span>

            Logout
          </button>
        </div>
      </aside>
    </>
  );
}