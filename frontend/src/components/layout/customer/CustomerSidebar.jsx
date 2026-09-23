import {
  FileText,
  Gift,
  HelpCircle,
  Home,
  LogOut,
  User,
  WalletCards,
  X,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
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
    label: 'Refer & Earn',
    path: '/customer/referral',
    icon: Gift,
   
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

export default function CustomerSidebar({ isOpen, onClose, customer }) {
  const navigate = useNavigate();

  const rawMobile = customer?.mobileNumber || '';
  const fullName = customer?.fullName?.trim() || '';

  const displayName = fullName
    ? fullName
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
    : 'Customer';

  const maskedMobile = rawMobile
    ? `+91 ${rawMobile.slice(0, 2)}••••${rawMobile.slice(-4)}`
    : 'Verified Account';

  const initials = fullName
    ? fullName
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w.charAt(0))
        .join('')
        .toUpperCase()
    : 'CU';

  const handleLogout = async () => {
    await doCustomerLogout();
    navigate('/customer/login', { replace: true });
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] transition-opacity lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-slate-200/90 bg-white transition-transform duration-300 ease-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* =========================================
            LOGO SECTION (Aligned with Header height)
        ========================================= */}
        <div className="flex h-[70px] shrink-0 items-center justify-between border-b border-slate-100 px-5">
          <button
            type="button"
            onClick={() => {
              onClose?.();
              navigate('/customer/dashboard');
            }}
            className="flex items-center gap-2.5 outline-none transition hover:opacity-90"
          >
            <img
              src="/image/IMG_0007-removebg-preview.png"
              alt="FinLeaf"
              className="h-[46px] w-auto max-w-[140px] object-contain"
            />
          </button>

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* =========================================
            NAVIGATION MENU
        ========================================= */}
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {/* Section header */}
          <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Menu
          </div>

          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) => `
                    group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-all duration-150
                    ${
                      isActive
                        ? 'bg-emerald-50 text-[#0E3B2C] ring-1 ring-emerald-200/60 shadow-xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }
                  `}
                >
                  {({ isActive }) => (
                    <>
                      {/* Active Left Pill Accent */}
                      {isActive && (
                        <span className="absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-[#1F8A5B]" />
                      )}

                      {/* Icon */}
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150 ${
                          isActive
                            ? 'bg-[#0E3B2C] text-white shadow-xs'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/70 group-hover:text-slate-800'
                        }`}
                      >
                        <Icon size={16} strokeWidth={isActive ? 2.2 : 2} />
                      </span>

                      {/* Label */}
                      <span className="truncate flex-1">{item.label}</span>

                      {/* Optional Badge */}
                      {item.badge && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                            isActive
                              ? 'bg-emerald-200/70 text-emerald-900'
                              : 'bg-emerald-100/80 text-emerald-800'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>

        {/* =========================================
            BOTTOM ACCOUNT & LOGOUT
        ========================================= */}
        <div className="shrink-0 border-t border-slate-100 p-3">
          {/* Customer info tile -> links to Profile */}
          <button
            type="button"
            onClick={() => {
              onClose?.();
              navigate('/customer/profile');
            }}
            className="group mb-2 flex w-full items-center gap-3 rounded-xl border border-slate-200/60 bg-slate-50/70 p-2.5 text-left transition hover:border-slate-300 hover:bg-slate-100/80"
          >
            {/* Avatar */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 to-[#0E3B2C] text-xs font-bold text-white shadow-xs">
              {initials}
            </div>

            {/* Customer Details */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-800 group-hover:text-slate-900">
                {displayName}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">
                {maskedMobile}
              </p>
            </div>

            {/* Online Status Dot */}
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </button>

          {/* Logout Button */}
          <button
            type="button"
            onClick={handleLogout}
            className="group flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-[13px] font-semibold text-slate-500 transition-all duration-150 hover:bg-red-50 hover:text-red-600"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-400 transition group-hover:bg-red-100 group-hover:text-red-600">
              <LogOut size={15} />
            </span>
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}