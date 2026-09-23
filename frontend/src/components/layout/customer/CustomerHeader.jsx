import {
  Bell,
  CheckCheck,
  ChevronDown,
  FileText,
  HelpCircle,
  Home,
  LogOut,
  Menu,
  ShieldCheck,
  User,
  WalletCards,
  X,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { doCustomerLogout } from '../../../features/customer/customerApi';

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
    subtitle: 'Review your loan offer and repayment schedule.',
  },
  '/customer/referral': {
    title: 'Refer & Earn',
    subtitle: 'Invite friends and track your referral rewards.',
  },
  '/customer/profile': {
    title: 'My Profile',
    subtitle: 'Manage your personal information and documents.',
  },
  '/customer/support': {
    title: 'Help & Support',
    subtitle: 'Reach out to our customer care team anytime.',
  },
};

const mockNotifications = [
  {
    id: 1,
    title: 'Application Update',
    message: 'Your personal loan application is actively being processed.',
    time: '10m ago',
    unread: true,
  },
  {
    id: 2,
    title: 'Assessment Fee',
    message: 'Assessment fee receipt is now available to download.',
    time: '2h ago',
    unread: false,
  },
  {
    id: 3,
    title: 'Security Notice',
    message: '2FA verified session initiated successfully.',
    time: '1d ago',
    unread: false,
  },
];

export default function CustomerHeader({ onMenuClick, customer }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState(mockNotifications);

  const profileRef = useRef(null);
  const notificationsRef = useRef(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target)
      ) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close menus on route change
  useEffect(() => {
    setProfileOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

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

  const pageInformation = (() => {
    if (pageTitles[location.pathname]) return pageTitles[location.pathname];
    if (
      location.pathname.startsWith('/customer/loan/') &&
      location.pathname.endsWith('/post-approval')
    ) {
      return {
        title: 'Loan Journey',
        subtitle: 'Complete final verification to receive your loan disbursement.',
      };
    }
    if (location.pathname.startsWith('/customer/loan/')) {
      return {
        title: 'Loan Details',
        subtitle: 'Review your sanctioned loan offer and repayment schedule.',
      };
    }
    return pageTitles['/customer/dashboard'];
  })();

  const unreadCount = notifications.filter((n) => n.unread).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleLogout = async () => {
    await doCustomerLogout();
    navigate('/customer/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-[70px] items-center border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-all">
      <div className="flex w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left section: Mobile hamburger + Page Title */}
        <div className="flex min-w-0 items-center gap-3.5">
          <button
            type="button"
            onClick={onMenuClick}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 active:scale-95 lg:hidden"
            aria-label="Open sidebar menu"
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">
              {pageInformation.title}
            </h1>
            <p className="hidden truncate text-xs font-medium text-slate-500 sm:block">
              {pageInformation.subtitle}
            </p>
          </div>
        </div>

        {/* Right section: Support Link + Notifications + Profile dropdown */}
        <div className="flex items-center gap-2.5 sm:gap-3">
        

          {/* Notifications Dropdown */}
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen((prev) => !prev);
                setProfileOpen(false);
              }}
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-95"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600 ring-2 ring-white" />
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 z-50 mt-2.5 w-80 sm:w-92 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 transition-all">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                    >
                      <CheckCheck size={13} />
                      Mark read
                    </button>
                  )}
                </div>

                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                  {notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 p-3.5 transition hover:bg-slate-50 ${
                        item.unread ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <div
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                          item.unread ? 'bg-emerald-500' : 'bg-transparent'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          {item.message}
                        </p>
                        <p className="mt-1 text-[10px] font-medium text-slate-400">
                          {item.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Customer Profile Pill & Menu */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setProfileOpen((prev) => !prev);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-1.5 pr-2.5 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 active:scale-98"
              aria-label="User account menu"
            >
              {/* Initials Avatar */}
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-600 to-[#0E3B2C] text-xs font-bold text-white shadow-xs">
                {initials}
              </div>

              {/* Customer Name & Subtitle */}
              <div className="hidden text-left sm:block">
                <p className="max-w-[130px] truncate text-xs font-bold leading-tight text-slate-800">
                  {displayName}
                </p>
                <p className="max-w-[130px] truncate text-[11px] font-medium leading-tight text-slate-500">
                  {maskedMobile}
                </p>
              </div>

              <ChevronDown
                size={15}
                className={`text-slate-400 transition-transform duration-200 ${
                  profileOpen ? 'rotate-180 text-emerald-700' : ''
                }`}
              />
            </button>

            {/* Profile Dropdown */}
            {profileOpen && (
              <div className="absolute right-0 z-50 mt-2.5 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
                {/* User card header */}
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-600 to-[#0E3B2C] text-xs font-bold text-white shadow-xs">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-900">
                        {displayName}
                      </p>
                      <p className="truncate text-[11px] font-medium text-slate-500">
                        {maskedMobile}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px]">
                    <span className="flex items-center gap-1 font-semibold text-emerald-700">
                      <ShieldCheck size={13} />
                      Verified Borrower
                    </span>
                    <span className="rounded bg-emerald-100/80 px-1.5 py-0.5 font-bold text-emerald-800 text-[10px]">
                      Active
                    </span>
                  </div>
                </div>

                {/* Navigation links */}
                <div className="mt-1.5 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/customer/dashboard');
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Home size={15} className="text-slate-400" />
                    <span>Dashboard</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/customer/profile');
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <User size={15} className="text-slate-400" />
                    <span>My Profile</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/customer/application');
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <FileText size={15} className="text-slate-400" />
                    <span>My Application</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/customer/loan-details');
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <WalletCards size={15} className="text-slate-400" />
                    <span>Loan Details</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/customer/support');
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <HelpCircle size={15} className="text-slate-400" />
                    <span>Help & Support</span>
                  </button>
                </div>

                <div className="my-1 border-t border-slate-100" />

                {/* Logout */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50 hover:text-red-700"
                >
                  <LogOut size={15} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}