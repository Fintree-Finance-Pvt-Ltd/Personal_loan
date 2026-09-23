import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  getCustomerAccessToken,
  doCustomerRefresh,
  shouldClearCustomerSession,
  getCustomerMe,
} from '../../../features/customer/customerApi';
import CustomerHeader from './CustomerHeader';
import CustomerSidebar from './CustomerSidebar';

function getStoredCustomer() {
  try {
    const raw =
      localStorage.getItem('customerSession') ||
      sessionStorage.getItem('customerSession');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function CustomerLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [customer, setCustomer] = useState(getStoredCustomer);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let isCancelled = false;

    const initAuth = async () => {
      let token = getCustomerAccessToken();

      if (!token) {
        const hasStoredSession = Boolean(
          localStorage.getItem('customerSession') ||
            sessionStorage.getItem('customerSession')
        );

        if (!hasStoredSession) {
          navigate(`/customer/login${location.search}`, { replace: true });
          return;
        }

        try {
          await doCustomerRefresh();
          token = getCustomerAccessToken();
        } catch (error) {
          if (!isCancelled) setIsInitializing(false);
          if (shouldClearCustomerSession(error)) {
            localStorage.removeItem('customerSession');
            sessionStorage.removeItem('customerSession');
            navigate(`/customer/login${location.search}`, { replace: true });
          }
          return;
        }
      }

      if (isCancelled) return;
      setIsInitializing(false);

      // Fetch latest profile to keep customer name & phone in sync across navbar & sidebar
      try {
        const profile = await getCustomerMe();
        if (profile && !isCancelled) {
          setCustomer((prev) => ({ ...prev, ...profile }));
          try {
            const stored = JSON.parse(
              localStorage.getItem('customerSession') || '{}'
            );
            localStorage.setItem(
              'customerSession',
              JSON.stringify({
                ...stored,
                customerId: profile.id || profile.customerId || stored.customerId,
                customerCode: profile.customerCode || stored.customerCode,
                mobileNumber: profile.mobileNumber || stored.mobileNumber,
                fullName: profile.fullName || stored.fullName,
              })
            );
          } catch {
            // Ignore storage write issues
          }
        }
      } catch {
        // Non-blocking: profile fetch failure shouldn't prevent layout from rendering
      }
    };

    initAuth();

    return () => {
      isCancelled = true;
    };
  }, [navigate, location.search]);

  // Keep access token proactive refresh alive
  useEffect(() => {
    if (isInitializing) return undefined;
    const HEARTBEAT_MS = 10 * 60 * 1000;
    const timer = setInterval(() => {
      doCustomerRefresh().catch(() => {});
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [isInitializing]);

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500">Loading your account…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F9F6]">
      <CustomerSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        customer={customer}
      />

      <div className="min-h-screen lg:pl-[260px]">
        <CustomerHeader
          onMenuClick={() => setSidebarOpen(true)}
          customer={customer}
        />

        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet context={{ customer, setCustomer }} />
        </main>
      </div>
    </div>
  );
}