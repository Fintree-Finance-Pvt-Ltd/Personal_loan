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
    doCustomerRefresh()
      .then(() => setIsInitializing(false))
      .catch(() => {
        navigate('/customer/login');
      });
  }, [navigate]);

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