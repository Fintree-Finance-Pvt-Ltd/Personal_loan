import { useState } from 'react';
import { Loader2, RefreshCw, Zap } from 'lucide-react';
import { Alert, Badge, Button, Panel, TableShell } from '../../../components/ui';
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

const PAYMENT_STATUS_TONE = {
  PAID: 'brand',
  OVERDUE: 'danger',
};

const DEBIT_STATUS_TONE = {
  SUCCESS: 'brand',
  IN_PROCESS: 'info',
  SUBMITTING: 'info',
};

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
        text: res?.message || `Debit Request dispatched successfully! Status: ${res?.status || 'IN_PROCESS'}`,
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

  const handleReconcileDebit = async (schedule) => {
    if (!canManage) return;
    setProcessingRpsId(`rec_${schedule.id}`);
    setMessage(null);

    try {
      const res = await applicationsApi.reconcileDebit(schedule.id);
      setMessage({
        type: res?.status === 'SUCCESS' ? 'success' : res?.status === 'FAILURE' ? 'danger' : 'info',
        text: res?.message || `Reconciliation result: ${res?.status}`,
      });
      if (onChanged) onChanged();
    } catch (err) {
      setMessage({
        type: 'error',
        text: apiError(err, 'Failed to reconcile debit status.'),
      });
    } finally {
      setProcessingRpsId(null);
    }
  };

  return (
    <Panel
      className="mb-6"
      title={
        <span className="flex flex-wrap items-center gap-2">
          Repayment schedule &amp; AutoCollect mandate presentment
          {activeMandate && (
            <Badge tone={activeMandate.status === 'AUTHORIZED' || activeMandate.status === 'COMPLETED' ? 'brand' : 'caution'}>
              {activeMandate.mandateType} ({activeMandate.status})
            </Badge>
          )}
        </span>
      }
      description="View EMI schedule, mandate details, and trigger manual or scheduled AutoCollect debit requests."
      actions={
        activeMandate && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 shadow-sm">
            <span><strong className="text-ink">Mandate ID:</strong> {activeMandate.merchantTransactionId || activeMandate.providerMandateId || '-'}</span>
            <span>·</span>
            <span><strong className="text-ink">Max limit:</strong> {formatCurrency(activeMandate.amount)}</span>
          </div>
        )
      }
    >
      {message && (
        <div className="mb-4">
          <Alert tone={message.type === 'success' ? 'success' : message.type === 'danger' ? 'danger' : 'info'}>
            {message.text}
          </Alert>
        </div>
      )}

      {(!schedules || schedules.length === 0) ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          No repayment schedule generated for this loan yet.
        </p>
      ) : (
        <TableShell>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">#</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Due date</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">EMI amount</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Remaining</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Status</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Latest AutoCollect status</th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-neutral-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {schedules.map((schedule) => {
              const isPaid = schedule.paymentStatus === 'PAID';
              const isProcessing = processingRpsId === schedule.id;
              const isReconciling = processingRpsId === `rec_${schedule.id}`;
              const debit = schedule.latestDebitRequest;

              return (
                <tr key={schedule.id} className="hover:bg-neutral-50/70">
                  <td className="font-numeric px-4 py-3 font-semibold text-ink">{schedule.installmentNumber}</td>
                  <td className="px-4 py-3 text-neutral-700">{formatDate(schedule.dueDate)}</td>
                  <td className="font-numeric px-4 py-3 font-semibold text-ink">{formatCurrency(schedule.emi)}</td>
                  <td className="font-numeric px-4 py-3 text-neutral-700">{formatCurrency(schedule.remainingAmount)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={PAYMENT_STATUS_TONE[schedule.paymentStatus] || 'caution'}>{schedule.paymentStatus}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {debit ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Badge tone={DEBIT_STATUS_TONE[debit.status] || 'danger'}>{debit.status}</Badge>
                          <span className="text-xs text-neutral-500">
                            (Attempt #{debit.attemptNumber})
                          </span>
                        </div>
                        {debit.failureReason && (
                          <p className="max-w-xs truncate text-xs text-danger-600" title={debit.failureReason}>
                            {debit.failureReason}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400">No debit attempt</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {debit && canManage && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isProcessing || isReconciling}
                          onClick={() => handleReconcileDebit(schedule)}
                          title="Check live status from Easebuzz"
                        >
                          {isReconciling ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Checking…
                            </>
                          ) : (
                            <>
                              <RefreshCw size={13} />
                              Sync status
                            </>
                          )}
                        </Button>
                      )}

                      {!isPaid && canManage && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={isProcessing || isReconciling || !activeMandate}
                          onClick={() => handleRetryDebit(schedule)}
                          title="Trigger AutoCollect Debit API"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Presenting…
                            </>
                          ) : (
                            <>
                              <Zap size={13} />
                              Present / debit now
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
    </Panel>
  );
}
