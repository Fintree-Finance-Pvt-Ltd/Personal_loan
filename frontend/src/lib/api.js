import axios from 'axios';
import { appendUtmToParams } from '../features/utm/utm';

let accessToken = null;
let refreshPromise = null;
let onSessionExpired = () => {};

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export const setAccessToken = (token) => {
  accessToken = token || null;
};

export const configureSessionExpiry = (handler) => {
  onSessionExpired = handler;
};

export const refreshAccess = async () => {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/admin/refresh', {}, { skipAuthRefresh: true })
      .then((response) => {
        setAccessToken(response.data.data.accessToken);
        return response.data.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  // Attach UTM parameters as query params for marketing attribution
  if (config.params) {
    appendUtmToParams(config.params);
  } else {
    config.params = {};
    appendUtmToParams(config.params);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isUnauthorized = error.response?.status === 401;
    if (!isUnauthorized || original?._retry || original?.skipAuthRefresh) return Promise.reject(error);
    original._retry = true;
    try {
      await refreshAccess();
      return api(original);
    } catch (refreshError) {
      setAccessToken(null);
      onSessionExpired();
      return Promise.reject(refreshError);
    }
  },
);

export const apiError = (error, fallback = 'The request could not be completed.') =>
  error.response?.data?.error?.message || fallback;
