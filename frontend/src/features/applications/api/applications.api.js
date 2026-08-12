import { api } from '../../../lib/api';

export const applicationsApi = {
  list: async (params = {}) => {
    const res = await api.get('/admin/applications', { params });
    return res.data.data;
  },
  getDetails: async (applicationId) => {
    const res = await api.get(`/admin/applications/${applicationId}`);
    return res.data.data;
  },
  retryStage: async (eventId) => {
    const res = await api.post(`/admin/lender-integrations/events/${eventId}/replay`);
    return res.data.data;
  },
};
