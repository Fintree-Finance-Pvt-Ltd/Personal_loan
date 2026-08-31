import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, configureSessionExpiry, refreshAccess, setAccessToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ status: 'loading', user: null, roleCodes: [], permissionCodes: [], sessionId: null });

  const clear = useCallback(() => {
    setAccessToken(null);
    setAuth({ status: 'anonymous', user: null, roleCodes: [], permissionCodes: [], sessionId: null });
  }, []);

  useEffect(() => {
    configureSessionExpiry(clear);

    // This provider wraps the whole app (see main.jsx), including customer-facing routes,
    // which have their own entirely separate auth system (see features/customer/customerApi.js).
    // A customer obviously has no admin session, so attempting an admin token refresh on
    // every customer page load/reload is pure waste — one guaranteed-401 network call plus
    // an alarming-looking console error, with zero effect on the (unrelated) customer flow.
    if (!window.location.pathname.startsWith('/admin-master')) {
      clear();
      return;
    }

    let active = true;
    refreshAccess()
      .then(() => api.get('/auth/admin/me'))
      .then(({ data }) => {
        if (active) setAuth({ status: 'authenticated', ...data.data });
      })
      .catch(() => {
        if (active) clear();
      });
    return () => {
      active = false;
    };
  }, [clear]);

  const login = useCallback(async (credentials) => {
    const { data } = await api.post('/auth/admin/login', credentials, { skipAuthRefresh: true });
    setAccessToken(data.data.accessToken);
    const me = await api.get('/auth/admin/me');
    setAuth({ status: 'authenticated', ...me.data.data });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/admin/logout');
    } finally {
      clear();
    }
  }, [clear]);

const value = useMemo(
    () => ({
      ...auth,
      login,
      logout,
      hasPermission: (code) =>
        auth.roleCodes.includes('SUPERADMIN') ||
        auth.roleCodes.includes('OPERATIONS') ||
        auth.roleCodes.includes(code) ||
        auth.permissionCodes.includes(code),
    }),
    [auth, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
};
