import {
  Bell,
  ChevronDown,
  Menu,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const pageTitles = {
  '/customer/dashboard': {
    title: 'Dashboard',
    subtitle: 'Track your loan application and next steps.',
  },
  '/customer/application': {
    title: 'My Application',
    subtitle: 'View and complete your loan application.',
  },
  '/customer/loan-details': {
    title: 'Loan Details',
    subtitle: 'Review your loan offer and repayment details.',
  },
  '/customer/profile': {
    title: 'My Profile',
    subtitle: 'Manage your personal information.',
  },
  '/customer/support': {
    title: 'Help & Support',
    subtitle: 'Contact us for assistance.',
  },
};

export default function CustomerHeader({
  onMenuClick,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [profileOpen, setProfileOpen] = useState(false);

  const storedSession = JSON.parse(
    sessionStorage.getItem('customerSession') || 'null',
  );

  const mobileNumber = storedSession?.mobileNumber || '';

  const pageInformation = (() => {
    if (pageTitles[location.pathname]) return pageTitles[location.pathname];
    if (location.pathname.startsWith('/customer/loan/') && location.pathname.endsWith('/post-approval')) {
      return { title: 'Loan Journey', subtitle: 'Complete the steps to get your loan disbursed.' };
    }
    return pageTitles['/customer/dashboard'];
  })();

  const maskedMobile = mobileNumber
    ? `+91 ${mobileNumber.slice(0, 2)}XXXX${mobileNumber.slice(-4)}`
    : 'Customer';

  const handleLogout = () => {
    sessionStorage.removeItem('customerSession');

    navigate('/customer/login', {
      replace: true,
    });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
      <div className="flex min-h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left section */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu size={22} />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">
              {pageInformation.title}
            </h1>

            <p className="hidden truncate text-sm text-slate-500 sm:block">
              {pageInformation.subtitle}
            </p>
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="relative grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Notifications"
          >
            <Bell size={20} />

            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((current) => !current)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-1.5 pr-2 transition hover:bg-slate-50"
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                <User size={18} />
              </div>

              <div className="hidden text-left md:block">
                <p className="max-w-36 truncate text-xs font-bold text-slate-900">
                  Customer
                </p>

                <p className="max-w-36 truncate text-[11px] text-slate-500">
                  {maskedMobile}
                </p>
              </div>

              <ChevronDown
                size={16}
                className={`hidden text-slate-400 transition-transform sm:block ${
                  profileOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {profileOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close profile menu"
                  onClick={() => setProfileOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />

                <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="border-b border-slate-100 px-3 py-3">
                    <p className="text-sm font-bold text-slate-900">
                      Customer Account
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {maskedMobile}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/customer/profile');
                    }}
                    className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <User size={17} />
                    View Profile
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}