import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SessionsPage } from './pages/SessionsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/admin-master/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin-master/dashboard" element={<DashboardPage />} />
          <Route path="/admin-master/sessions" element={<SessionsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/admin-master/dashboard" replace />} />
    </Routes>
  );
}
