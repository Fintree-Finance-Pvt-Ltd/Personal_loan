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
  resendWelcomeLetter: async (lan) => {
    const res = await api.post(`/admin/loans/${lan}/welcome-letter/resend`);
    return res.data.data;
  },
  initiateIvrCall: async (applicationId, callType = 'APPLICATION_FOLLOW_UP') => {
    const res = await api.post(`/admin/applications/${applicationId}/ivr/call`, { callType });
    return res.data.data;
  },
  getIvrCallStatus: async (callId) => {
    const res = await api.get(`/admin/ivr/calls/${callId}`);
    return res.data.data;
  },
  getIvrCallHistory: async (applicationId) => {
    const res = await api.get(`/admin/applications/${applicationId}/ivr/history`);
    return res.data.data;
  },
  retryDebit: async (rpsId) => {
    const res = await api.post(`/admin/loans/repayment-schedule/${rpsId}/retry-debit`);
    return res.data.data;
  },
};

