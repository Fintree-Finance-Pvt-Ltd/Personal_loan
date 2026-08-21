import {
  FileText,
  HelpCircle,
  Home,
  LogOut,
  User,
  WalletCards,
  BadgeCheck,
  X,
} from 'lucide-react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { doCustomerLogout } from '../../../features/customer/customerApi';

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

function getStoredSession() {
  try {
    return JSON.parse(sessionStorage.getItem('customerSession') || 'null');
  } catch {
    return null;
  }
}

export default function CustomerSidebar({ isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getStoredSession();
  const mobileNumber = session?.mobileNumber || '';

  const maskedMobile = mobileNumber
    ? `+91 ${mobileNumber.slice(0, 2)}XXXX${mobileNumber.slice(-4)}`
    : 'Customer';

  // Detect if currently on post-approval journey page
  const isOnJourney =
    location.pathname.startsWith('/customer/loan/') &&
    location.pathname.endsWith('/post-approval');

  const handleLogout = async () => {
    await doCustomerLogout();
    navigate('/customer/login', { replace: true });
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-neutral-950/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-neutral-200 bg-white transition-transform duration-300 lg:tranneutral-x-0 ${isOpen ? 'tranneutral-x-0' : '-tranneutral-x-full'
          }`}
      >
        {/* Logo */}
        {/* Logo */}
        <div className="flex h-20 shrink-0 items-center justify-between border-b border-neutral-200 px-6">
          <button
            type="button"
            onClick={() =>
              navigate('/customer/dashboard')
            }
            className="flex items-center"
          >
            <img
              src="/image/IMG_0007-removebg-preview.png"
              alt="FinLeaf"
              className="h-17 w-auto max-w-[120px] object-contain"
            />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 lg:hidden"
            aria-label="Close menu"
          >
            <X size={21} />
          </button>
        </div>

        {/* Customer card */}
        <div className="shrink-0 px-5 py-4">
          <div className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-500 p-4 text-white shadow-lg shadow-brand-600/15">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/20">
                <User size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">Customer</p>
                <p className="truncate text-xs text-brand-100">{maskedMobile}</p>
              </div>
              <BadgeCheck size={18} className="ml-auto shrink-0 text-brand-200" />
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 pb-4">
          <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400">
            Main Menu
          </p>

          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${isActive
                          ? 'bg-brand-100 text-brand-700'
                          : 'bg-neutral-100 text-neutral-500'
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

          {/* Loan Journey active indicator */}
          {isOnJourney && (
            <div className="mt-4">
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400">
                Active Journey
              </p>
              <div className="flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-700">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700">
                  <BadgeCheck size={18} />
                </span>
                <span>Loan Journey</span>
                <span className="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-500" />
              </div>
            </div>
          )}
        </nav>

        {/* Logout */}
        <div className="shrink-0 border-t border-neutral-200 p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-danger-600 transition hover:bg-danger-50"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-danger-50 text-danger-500">
              <LogOut size={18} />
            </span>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}