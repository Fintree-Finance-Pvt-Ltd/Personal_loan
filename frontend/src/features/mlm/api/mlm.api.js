import { api } from '../../../lib/api';

export const mlmApi = {
  getPolicies: async () => {
    const res = await api.get('/admin/mlm-policies');
    return res.data.data;
  },
  getDistributionDashboard: async (params = {}) => {
    const res = await api.get('/admin/mlm-distribution', { params });
    return res.data.data;
  },
  getPolicyDetails: async (policyId, params = {}) => {
    const res = await api.get(`/admin/mlm-policies/${policyId}`, { params });
    return res.data.data;
  },
  createPolicy: async (data) => {
    const res = await api.post('/admin/mlm-policies', data);
    return res.data.data;
  },
  updatePolicy: async (policyId, data) => {
    const res = await api.patch(`/admin/mlm-policies/${policyId}`, data);
    return res.data.data;
  },
  createPolicyVersion: async (policyId, data) => {
    const res = await api.post(`/admin/mlm-policies/${policyId}/versions`, data);
    return res.data.data;
  },
  updatePolicyVersionRoutes: async (versionId, data) => {
    const res = await api.put(`/admin/mlm-policy-versions/${versionId}/routes`, data);
    return res.data.data;
  },
  submitPolicyVersion: async (versionId) => {
    const res = await api.post(`/admin/mlm-policy-versions/${versionId}/submit`);
    return res.data.data;
  },
  approvePolicyVersion: async (versionId) => {
    const res = await api.post(`/admin/mlm-policy-versions/${versionId}/approve`);
    return res.data.data;
  },
  rejectPolicyVersion: async (versionId, data) => {
    const res = await api.post(`/admin/mlm-policy-versions/${versionId}/reject`, data);
    return res.data.data;
  },
  activatePolicyVersion: async (versionId) => {
    const res = await api.post(`/admin/mlm-policy-versions/${versionId}/activate`);
    return res.data.data;
  },
  simulatePolicyVersion: async (versionId, data) => {
    const res = await api.post(`/admin/mlm-policy-versions/${versionId}/simulate`, data);
    return res.data.data;
  },
  getCapacities: async () => {
    const res = await api.get('/admin/mlm-capacities');
    return res.data.data;
  },
  getDecisions: async (limit = 50, offset = 0) => {
    const res = await api.get('/admin/mlm-allocations/decisions', {
      params: { limit, offset }
    });
    return res.data.data;
  },
};
