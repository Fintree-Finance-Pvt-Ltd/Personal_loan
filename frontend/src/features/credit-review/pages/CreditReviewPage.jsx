import React, { useEffect, useState } from 'react';
import { creditReviewApi } from '../api/creditReview.api';
import { apiError } from '../../../lib/api';

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '-';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

export default function CreditReviewPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioningId, setActioningId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    creditReviewApi
      .getPending()
      .then(setApplications)
      .catch((err) => setError(apiError(err, 'Unable to load pending applications.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleApprove = async (applicationId) => {
    setActioningId(applicationId);
    setError('');
    try {
      await creditReviewApi.approve(applicationId);
      load();
    } catch (err) {
      setError(apiError(err, 'Unable to approve this application.'));
      setActioningId(null);
    }
  };

  const handleRejectSubmit = async (applicationId) => {
    setActioningId(applicationId);
    setError('');
    try {
      await creditReviewApi.reject(applicationId, rejectReason);
      setRejectingId(null);
      setRejectReason('');
      load();
    } catch (err) {
      setError(apiError(err, 'Unable to reject this application.'));
      setActioningId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Final Approval Review</h1>
          <p className="text-sm text-gray-500 mt-1">
            Applications where the customer has selected an offer and the final lender decision is pending. Use Approve/Reject to override manually instead of waiting for the lender's async result.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Application</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lender</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Selected Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Selected Tenure</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Selected At</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan="7" className="px-6 py-4 text-center">Loading...</td></tr>
            ) : applications.length === 0 ? (
              <tr><td colSpan="7" className="px-6 py-4 text-center text-gray-500">No applications pending credit review</td></tr>
            ) : (
              applications.map((application) => (
                <React.Fragment key={application.applicationId}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{application.applicationReference}</td>
                    <td className="px-6 py-4">
                      <div>{application.customerName}</div>
                      <div className="text-xs text-gray-500">{application.customerMobile}</div>
                    </td>
                    <td className="px-6 py-4">{application.lenderCode || application.lenderId}</td>
                    <td className="px-6 py-4">{formatCurrency(application.selectedAmount)}</td>
                    <td className="px-6 py-4">{application.selectedTenure ?? '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {application.selectedAt ? new Date(application.selectedAt).toLocaleString('en-IN') : '-'}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={actioningId === application.applicationId}
                        onClick={() => handleApprove(application.applicationId)}
                        className="mr-3 text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actioningId === application.applicationId}
                        onClick={() =>
                          setRejectingId(
                            rejectingId === application.applicationId ? null : application.applicationId,
                          )
                        }
                        className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                  {rejectingId === application.applicationId && (
                    <tr className="bg-gray-50">
                      <td colSpan="7" className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            placeholder="Reason for rejection (optional)"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            disabled={actioningId === application.applicationId}
                            onClick={() => handleRejectSubmit(application.applicationId)}
                            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Confirm Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingId(null);
                              setRejectReason('');
                            }}
                            className="text-sm text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
