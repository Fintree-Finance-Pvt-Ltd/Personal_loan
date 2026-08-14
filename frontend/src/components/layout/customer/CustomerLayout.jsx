import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { getCustomerAccessToken, doCustomerRefresh } from '../../../features/customer/customerApi';
import CustomerHeader from './CustomerHeader';
import CustomerSidebar from './CustomerSidebar';

export default function CustomerLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (getCustomerAccessToken()) {
      setIsInitializing(false);
      return;
    }

    const hasStoredSession = Boolean(localStorage.getItem('customerSession') || sessionStorage.getItem('customerSession'));

    if (!hasStoredSession) {
      navigate('/customer/login', { replace: true });
      return;
    }

    doCustomerRefresh()
      .then(() => setIsInitializing(false))
      .catch(() => {
        setIsInitializing(false);
        localStorage.removeItem('customerSession');
        sessionStorage.removeItem('customerSession');
        navigate('/customer/login', { replace: true });
      });
  }, [navigate]);

  // Customer sessions have no idle timeout (only a 30-day absolute cap — see
  // otp.service.ts), so this heartbeat isn't preventing a logout. It's here so
  // the access token (15-minute JWT) is proactively renewed while a tab sits
  // open, rather than expiring silently and making the customer's next click
  // eat an invisible 401-then-retry round trip. A single missed beat (network
  // blip) is harmless — the next real request's 401 handling covers it.
  useEffect(() => {
    if (isInitializing) return undefined;
    const HEARTBEAT_MS = 10 * 60 * 1000;
    const timer = setInterval(() => {
      doCustomerRefresh().catch(() => {});
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [isInitializing]);

  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <CustomerSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="min-h-screen lg:pl-72">
        <CustomerHeader
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}