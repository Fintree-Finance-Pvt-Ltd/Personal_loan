import { api } from '../../../lib/api';

function dataOf(response) {
  return response.data.data;
}

export const productsApi = {
  listProducts: async (params) => {
    const response = await api.get('/admin/products', { params });
    return dataOf(response);
  },

  getProduct: async (id) => {
    const response = await api.get(`/admin/products/${id}`);
    return dataOf(response);
  },

  createProduct: async (payload) => {
    const response = await api.post('/admin/products', payload);
    return dataOf(response);
  },

  updateProductIdentity: async (id, payload) => {
    const response = await api.patch(`/admin/products/${id}`, payload);
    return dataOf(response);
  },

  updateProductVersion: async (versionId, payload) => {
    const response = await api.patch(`/admin/product-versions/${versionId}`, payload);
    return dataOf(response);
  },

  replaceOfferTiers: async (versionId, payload) => {
    const response = await api.put(`/admin/product-versions/${versionId}/tiers`, payload);
    return dataOf(response);
  },

  submitVersion: async (versionId) => {
    const response = await api.post(`/admin/product-versions/${versionId}/submit`, {});
    return dataOf(response);
  },

  approveVersion: async (versionId) => {
    const response = await api.post(`/admin/product-versions/${versionId}/approve`, {});
    return dataOf(response);
  },

  rejectVersion: async (versionId, payload) => {
    const response = await api.post(`/admin/product-versions/${versionId}/reject`, payload);
    return dataOf(response);
  },

  activateVersion: async (versionId) => {
    const response = await api.post(`/admin/product-versions/${versionId}/activate`, {});
    return dataOf(response);
  },

  createNextVersion: async (productId) => {
    const response = await api.post(`/admin/products/${productId}/versions`, {});
    return dataOf(response);
  },

  simulateAmount: async (versionId, payload) => {
    const response = await api.post(`/admin/product-versions/${versionId}/simulate`, payload);
    return dataOf(response);
  },
};
