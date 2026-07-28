import { api } from '../../../lib/api';

export const platformProductsApi = {
  listPlatformProducts: async (params = {}) => {
    const response = await api.get('/admin/platform-products', { params });
    return response.data.data || response.data;
  },

  getPlatformProduct: async (id) => {
    const response = await api.get(`/admin/platform-products/${id}`);
    return response.data.data || response.data;
  },

  createPlatformProduct: async (data) => {
    const response = await api.post('/admin/platform-products', data);
    return response.data.data || response.data;
  },

  updatePlatformProduct: async (id, data) => {
    const response = await api.patch(`/admin/platform-products/${id}`, data);
    return response.data.data || response.data;
  },

  activatePlatformProduct: async (id) => {
    const response = await api.post(`/admin/platform-products/${id}/activate`);
    return response.data.data || response.data;
  },

  deactivatePlatformProduct: async (id) => {
    const response = await api.post(`/admin/platform-products/${id}/deactivate`);
    return response.data.data || response.data;
  },
};
