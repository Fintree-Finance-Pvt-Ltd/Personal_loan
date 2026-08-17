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
  addLoanCharge: async (lan, { chargeType, amount, dueDate, remarks }) => {
    const res = await api.post(`/admin/loans/${lan}/charges`, {
      chargeType,
      amount: String(amount),
      dueDate,
      remarks: remarks || undefined,
    });
    return res.data.data;
  },
  waiveLoanCharge: async (lan, chargeId, { waiverAmount, remarks }) => {
    const res = await api.post(`/admin/loans/${lan}/charges/${chargeId}/waiver`, {
      waiverAmount: String(waiverAmount),
      remarks: remarks || undefined,
    });
    return res.data.data;
  },
};
