import {
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import { AdminLayout } from './components/AdminLayout';
import { ProtectedRoute } from './components/ProtectedRoute';

import CustomerLayout from './components/layout/customer/CustomerLayout';

import { LoginPage } from './features/auth/pages/LoginPage';
import { DashboardPage } from './features/dashboard/pages/DashboardPage';
import { SessionsPage } from './features/admin/pages/SessionsPage';

import CustomerSignIn from './features/auth/pages/CustomerSignIn';
import CustomerDashboard from './features/customer/pages/CustomerDashboard';
import CustomerPlaceholderPage from './features/customer/pages/CustomerPlaceholderPage';
import MyApplicationPage from './features/customer/pages/MyApplicationPage';


export default function App() {
  return (
    <Routes>
      {/* Public customer login */}
      <Route
        path="/customer/login"
        element={<CustomerSignIn />}
      />

      {/* Customer layout routes */}
      <Route element={<CustomerLayout />}>
        <Route
          path="/customer/dashboard"
          element={<CustomerDashboard />}
        />

     <Route
  path="/customer/application"
  element={<MyApplicationPage />}
/>

        <Route
          path="/customer/loan-details"
          element={
            <CustomerPlaceholderPage
              title="Loan Details"
              description="Your approved loan amount, tenure and repayment information will appear here."
            />
          }
        />

        <Route
          path="/customer/profile"
          element={
            <CustomerPlaceholderPage
              title="My Profile"
              description="Manage your personal and contact information."
            />
          }
        />

        <Route
          path="/customer/support"
          element={
            <CustomerPlaceholderPage
              title="Help & Support"
              description="Contact the Fintree Finance customer support team."
            />
          }
        />
      </Route>

      {/* Admin public login */}
      <Route
        path="/admin-master/login"
        element={<LoginPage />}
      />

      {/* Admin protected layout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route
            path="/admin-master/dashboard"
            element={<DashboardPage />}
          />

          <Route
            path="/admin-master/sessions"
            element={<SessionsPage />}
          />
        </Route>
      </Route>

      <Route
        path="/"
        element={
          <Navigate
            to="/customer/login"
            replace
          />
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/customer/login"
            replace
          />
        }
      />
    </Routes>
  );
}