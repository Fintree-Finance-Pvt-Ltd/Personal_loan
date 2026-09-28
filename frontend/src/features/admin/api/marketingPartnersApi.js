import { api } from '../../../lib/api';

export const marketingPartnersApi = {
  async listPartners() {
    const res = await api.get('/admin/marketing-partners');
    const val = res.data?.data !== undefined ? res.data.data : res.data;
    return Array.isArray(val) ? val : [];
  },

  async createPartner(payload) {
    const res = await api.post('/admin/marketing-partners', payload);
    return res.data?.data !== undefined ? res.data.data : res.data;
  },

  async updatePartner(id, payload) {
    const res = await api.put(`/admin/marketing-partners/${id}`, payload);
    return res.data?.data !== undefined ? res.data.data : res.data;
  },

  async togglePartnerStatus(id, status) {
    const res = await api.patch(`/admin/marketing-partners/${id}/status`, { status });
    return res.data?.data !== undefined ? res.data.data : res.data;
  },

  async rotatePartnerSecret(id) {
    const res = await api.post(`/admin/marketing-partners/${id}/rotate-secret`);
    return res.data?.data !== undefined ? res.data.data : res.data;
  },

  async getAttributionAnalytics() {
    const res = await api.get('/admin/marketing-partners/analytics');
    return res.data?.data !== undefined ? res.data.data : res.data;
  },
};
