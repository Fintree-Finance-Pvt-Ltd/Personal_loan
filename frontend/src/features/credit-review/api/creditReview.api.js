import { api } from '../../../lib/api';

export const creditReviewApi = {
  getPending: async () => {
    const res = await api.get('/admin/credit-review');
    return res.data.data;
  },
  getApplicationDetails: async (applicationId) => {
    const res = await api.get(`/admin/applications/${applicationId}`);
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
  // Re-runs Digitap FaceMatch (live selfie vs DigiLocker Aadhaar photo) for this
  // application. Used when the automatic run at Aadhaar-KYC time was skipped or errored.
  runFaceMatch: async (applicationId) => {
    const res = await api.post(`/admin/applications/${applicationId}/face-match`);
    return res.data.data;
  },
};
