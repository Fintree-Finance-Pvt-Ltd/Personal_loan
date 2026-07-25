import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from './ui';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center text-brand-700">
        <Spinner label="Securing your session" />
      </div>
    );
  }

  if (auth.status !== 'authenticated') {
    return (
      <Navigate
        to="/admin-master/login"
        replace
        state={{ from: location }}
      />
    );
  }

  return <Outlet />;
}

export function PermissionRoute({ permission, children }) {
  const auth = useAuth();

  if (!auth.hasPermission(permission)) {
    return <Navigate to="/admin-master/dashboard" replace />;
  }

  return children;
}

export function PermissionGate({
  permission,
  fallback = null,
  children,
}) {
  const auth = useAuth();

  return auth.hasPermission(permission) ? children : fallback;
}