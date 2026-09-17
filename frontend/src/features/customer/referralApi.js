import { api } from '../../lib/api';
import axios from 'axios';
import { getCustomerAccessToken, getCustomerApiBaseUrl } from './customerApi';

const customerAxios = axios.create({
  baseURL: getCustomerApiBaseUrl(),
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

customerAxios.interceptors.request.use((config) => {
  const token = getCustomerAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function unwrapPayload(res) {
  let val = res?.data;
  while (val && typeof val === 'object' && !Array.isArray(val) && 'data' in val && val.data !== undefined) {
    val = val.data;
  }
  return val;
}

// ── CUSTOMER REFERRAL API CALLS ──────────────────────────────────────────────

export async function getReferralDashboard() {
  const res = await customerAxios.get('/referral/dashboard');
  return unwrapPayload(res);
}

export async function getReferralCode() {
  const res = await customerAxios.get('/referral/code');
  return unwrapPayload(res);
}

export async function validateReferralCode(code) {
  const res = await axios.post(`${getCustomerApiBaseUrl()}/referral/validate`, { referralCode: code });
  return unwrapPayload(res);
}

export async function applyReferralBenefit(payload) {
  const res = await customerAxios.post('/referral/apply-benefit', payload);
  return unwrapPayload(res);
}

// ── WEB ADMIN REFERRAL API CALLS ─────────────────────────────────────────────

export async function getAdminCampaigns() {
  const res = await api.get('/referral-admin/campaigns');
  const payload = unwrapPayload(res);
  return Array.isArray(payload) ? payload : [];
}

export async function createAdminCampaign(data) {
  const res = await api.post('/referral-admin/campaigns', data);
  return unwrapPayload(res);
}

export async function updateAdminCampaign(id, data) {
  const res = await api.put(`/referral-admin/campaigns/${id}`, data);
  return unwrapPayload(res);
}

export async function toggleAdminCampaignStatus(id, status) {
  const res = await api.patch(`/referral-admin/campaigns/${id}/status`, { status });
  return unwrapPayload(res);
}

export async function getReferralReports(params = {}) {
  const res = await api.get('/referral-admin/reports', { params });
  const payload = unwrapPayload(res);
  return payload && typeof payload === 'object' ? payload : { data: [], total: 0, page: 1, totalPages: 1 };
}

export async function exportReferralReportsCsv(params = {}) {
  const res = await api.get('/referral-admin/reports/export', {
    params,
    responseType: 'blob',
  });
  return res.data;
}

export async function getAdminBenefits(params = {}) {
  const res = await api.get('/referral-admin/benefits', { params });
  const payload = unwrapPayload(res);
  return payload && typeof payload === 'object' ? payload : { data: [], total: 0, page: 1, totalPages: 1 };
}

export async function adjustAdminBenefit(id, data) {
  const res = await api.patch(`/referral-admin/benefits/${id}`, data);
  return unwrapPayload(res);
}
