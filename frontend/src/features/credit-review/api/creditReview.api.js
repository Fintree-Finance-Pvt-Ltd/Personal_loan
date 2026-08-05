import { api } from '../../../lib/api';

export const creditReviewApi = {
  getPending: async () => {
    const res = await api.get('/admin/credit-review');
    return res.data.data;
  },
  approve: async (applicationId) => {
    const res = await api.post(`/admin/credit-review/${applicationId}/approve`);
    return res.data.data;
  },
  reject: async (applicationId, reason) => {
    const res = await api.post(`/admin/credit-review/${applicationId}/reject`, { reason });
    return res.data.data;
  },
};
