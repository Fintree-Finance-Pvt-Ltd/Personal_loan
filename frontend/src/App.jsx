import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import {
  PermissionRoute,
  ProtectedRoute,
} from './components/ProtectedRoute';
import { CreateLenderPage } from './features/lenders/pages/CreateLenderPage';
import { EditLenderPage } from './features/lenders/pages/EditLenderPage';
import { LenderDetailsPage } from './features/lenders/pages/LenderDetailsPage';
import { LendersPage } from './features/lenders/pages/LendersPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { SessionsPage } from './pages/SessionsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/admin-master/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route
            path="/admin-master/dashboard"
            element={
              <PermissionRoute permission="ADMIN_DASHBOARD_VIEW">
                <DashboardPage />
              </PermissionRoute>
            }
          />

          <Route
            path="/admin-master/lenders"
            element={
              <PermissionRoute permission="LENDER_READ">
                <LendersPage />
              </PermissionRoute>
            }
          />

          <Route
            path="/admin-master/lenders/new"
            element={
              <PermissionRoute permission="LENDER_CREATE">
                <CreateLenderPage />
              </PermissionRoute>
            }
          />

          <Route
            path="/admin-master/lenders/:lenderId"
            element={
              <PermissionRoute permission="LENDER_READ">
                <LenderDetailsPage />
              </PermissionRoute>
            }
          />

          <Route
            path="/admin-master/lenders/:lenderId/edit"
            element={
              <PermissionRoute permission="LENDER_UPDATE">
                <EditLenderPage />
              </PermissionRoute>
            }
          />

          <Route
            path="/admin-master/sessions"
            element={
              <PermissionRoute permission="SESSION_READ_OWN">
                <SessionsPage />
              </PermissionRoute>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/admin-master/dashboard" replace />} />
    </Routes>
  );
}
