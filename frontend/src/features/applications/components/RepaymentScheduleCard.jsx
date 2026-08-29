import React, { useState } from 'react';
import { Card, Alert, Spinner } from '../../../components/ui';
import { applicationsApi } from '../api/applications.api';
import { apiError } from '../../../lib/api';

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '-';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
}

export function RepaymentScheduleCard({
  lan,
  mandates = [],
  schedules = [],
  canManage = false,
  onChanged,
}) {
  const [processingRpsId, setProcessingRpsId] = useState(null);
  const [message, setMessage] = useState(null);

  const activeMandate = mandates.find(
    (m) => m.status === 'AUTHORIZED' || m.status === 'COMPLETED',
  ) || mandates[0];

  const handleRetryDebit = async (schedule) => {
    if (!canManage) return;
    const confirmMsg = `Initiate AutoCollect Mandate Presentment (Debit Request) for LAN ${lan} - Installment #${schedule.installmentNumber} of ${formatCurrency(schedule.remainingAmount || schedule.emi)}?`;
    if (!window.confirm(confirmMsg)) return;

    setProcessingRpsId(schedule.id);
    setMessage(null);

    try {
      const res = await applicationsApi.retryDebit(schedule.id);
      setMessage({
        type: 'success',
        text: `Debit Request dispatched successfully! Status: ${res?.status || 'IN_PROCESS'}`,
      });
      if (onChanged) onChanged();
    } catch (err) {
      setMessage({
        type: 'error',
        text: apiError(err, 'Failed to trigger mandate debit request.'),
      });
    } finally {
      setProcessingRpsId(null);
    }
  };

  return (
    <Card className="mb-6 !p-0 overflow-hidden">
      <div className="border-b bg-gray-50 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="font-bold text-gray-800 flex items-center gap-2">
            <span>Repayment Schedule & AutoCollect Mandate Presentment</span>
            {activeMandate && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                activeMandate.status === 'AUTHORIZED' || activeMandate.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {activeMandate.mandateType} ({activeMandate.status})
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            View EMI schedule, mandate details, and trigger manual or scheduled AutoCollect debit requests.
          </p>
        </div>

        {activeMandate && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
            <span><strong>Mandate ID:</strong> {activeMandate.merchantTransactionId || activeMandate.providerMandateId || '-'}</span>
            <span>•</span>
            <span><strong>Max Limit:</strong> {formatCurrency(activeMandate.amount)}</span>
          </div>
        )}
      </div>

      {message && (
        <div className="p-4 bg-gray-50 border-b">
          <Alert variant={message.type === 'success' ? 'success' : 'danger'}>
            {message.text}
          </Alert>
        </div>
      )}

      {(!schedules || schedules.length === 0) ? (
        <div className="p-6 text-center text-sm text-gray-500">
          No repayment schedule generated for this loan yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/80 border-b text-xs font-semibold uppercase text-gray-600">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">EMI Amount</th>
                <th className="px-4 py-3">Remaining</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Latest AutoCollect Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schedules.map((schedule) => {
                const isPaid = schedule.paymentStatus === 'PAID';
                const isProcessing = processingRpsId === schedule.id;
                const debit = schedule.latestDebitRequest;

                return (
                  <tr key={schedule.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {schedule.installmentNumber}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatDate(schedule.dueDate)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {formatCurrency(schedule.emi)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatCurrency(schedule.remainingAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        isPaid
                          ? 'bg-green-100 text-green-800'
                          : schedule.paymentStatus === 'OVERDUE'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {schedule.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {debit ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              debit.status === 'SUCCESS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : debit.status === 'IN_PROCESS' || debit.status === 'SUBMITTING'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {debit.status}
                            </span>
                            <span className="text-[11px] text-gray-500">
                              (Attempt #{debit.attemptNumber})
                            </span>
                          </div>
                          {debit.failureReason && (
                            <p className="text-[11px] text-red-600 truncate max-w-xs" title={debit.failureReason}>
                              {debit.failureReason}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No debit attempt</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isPaid && canManage && (
                        <button
                          type="button"
                          disabled={isProcessing || !activeMandate}
                          onClick={() => handleRetryDebit(schedule)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                          title="Trigger AutoCollect Debit API"
                        >
                          {isProcessing ? (
                            <>
                              <Spinner size="xs" />
                              <span>Presenting...</span>
                            </>
                          ) : (
                            <span>Present / Debit Now</span>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
