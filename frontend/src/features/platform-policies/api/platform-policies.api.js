import { api } from '../../../lib/api';

export const platformPoliciesApi = {
  getRuleCatalog: async () => {
    const response = await api.get('/admin/platform-policies/rule-catalog');
    return response.data.data;
  },
  
  findAll: async (params = {}) => {
    const response = await api.get('/admin/platform-policies', { params });
    return response.data.data;
  },

  findOne: async (policyId) => {
    const response = await api.get(`/admin/platform-policies/${policyId}`);
    return response.data.data;
  },

  createPolicy: async (data) => {
    const response = await api.post('/admin/platform-policies', data);
    return response.data.data;
  },

  updatePolicy: async (policyId, data) => {
    const response = await api.patch(`/admin/platform-policies/${policyId}`, data);
    return response.data.data;
  },

  createNewVersion: async (policyId) => {
    const response = await api.post(`/admin/platform-policies/${policyId}/versions`);
    return response.data.data;
  },

  updateVersionRules: async (versionId, expectedVersion, rules) => {
    const response = await api.put(`/admin/platform-policy-versions/${versionId}/rules`, {
      expectedVersion,
      rules
    });
    return response.data.data;
  },

  submitVersion: async (versionId, expectedVersion) => {
    const response = await api.post(`/admin/platform-policy-versions/${versionId}/submit`, { expectedVersion });
    return response.data.data;
  },

  approveVersion: async (versionId, expectedVersion) => {
    const response = await api.post(`/admin/platform-policy-versions/${versionId}/approve`, { expectedVersion });
    return response.data.data;
  },

  rejectVersion: async (versionId, expectedVersion, rejectionReason) => {
    const response = await api.post(`/admin/platform-policy-versions/${versionId}/reject`, {
      expectedVersion,
      rejectionReason
    });
    return response.data.data;
  },

  activateVersion: async (versionId, expectedVersion, effectiveFrom) => {
    const response = await api.post(`/admin/platform-policy-versions/${versionId}/activate`, {
      expectedVersion,
      effectiveFrom
    });
    return response.data.data;
  },

  simulatePolicy: async (versionId, payload) => {
    const response = await api.post(`/admin/platform-policy-versions/${versionId}/simulate`, payload);
    return response.data.data;
  }
};
