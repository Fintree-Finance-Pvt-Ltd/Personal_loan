import { api } from '../../lib/api';

export const dashboardApi = {
  getMetrics: async () => {
    const res = await api.get('/admin/dashboard/metrics');
    return res.data.data;
  },
};
