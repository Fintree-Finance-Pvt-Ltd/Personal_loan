import { useState } from 'react';
import { Ban, Bell, CheckCircle2, Loader2, RefreshCw, Zap } from 'lucide-react';
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
  const [isCancellingMandate, setIsCancellingMandate] = useState(false);
  const [message, setMessage] = useState(null);

  const activeMandate = mandates.find(
    (m) => m.status === 'AUTHORIZED' || m.status === 'COMPLETED',
  ) || mandates[0];

  const isMandateCancelled =
    activeMandate?.status === 'CANCELLED' ||
    activeMandate?.status === 'REVOKED' ||
    activeMandate?.status === 'USER_CANCELLED';

  const handleCancelMandate = async () => {
    if (!canManage || !activeMandate) return;
    const actionLabel = activeMandate.mandateType === 'ENACH' ? 'cancel' : 'revoke';
    const identifier = activeMandate.merchantTransactionId || activeMandate.providerMandateId || activeMandate.id;
    const confirmMsg = `Are you sure you want to ${actionLabel} the ${activeMandate.mandateType} mandate (${identifier}) for LAN ${lan}?\n\nThis will send a mandate status update to Easebuzz to ${actionLabel} the authorization. This action cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setIsCancellingMandate(true);
    setMessage(null);

    try {
      const res = await applicationsApi.cancelMandate(lan, {
        mandateId: activeMandate.id,
        remarks: 'AdminCancelled',
      });
      setMessage({
        type: res?.success !== false ? 'success' : 'danger',
        text: res?.message || `Mandate ${identifier} ${actionLabel}led successfully.`,
      });
      if (onChanged) onChanged();
    } catch (err) {
      setMessage({
        type: 'danger',
        text: apiError(err, 'Failed to cancel mandate on Easebuzz.'),
      });
    } finally {
      setIsCancellingMandate(false);
    }
  };

  const handleSendNotification = async (schedule) => {
    if (!canManage) return;
    const confirmMsg = `Send pre-debit notification to customer for LAN ${lan} - Installment #${schedule.installmentNumber} (${formatCurrency(schedule.remainingAmount || schedule.emi)})?`;
    if (!window.confirm(confirmMsg)) return;

    setProcessingRpsId(`notif_${schedule.id}`);
    setMessage(null);

    try {
      const res = await applicationsApi.sendNotification(schedule.id);
      setMessage({
        type: 'success',
        text: res?.message || 'Pre-debit notification sent successfully to customer!',
      });
      if (onChanged) onChanged();
    } catch (err) {
      setMessage({
        type: 'danger',
        text: apiError(err, 'Failed to send pre-debit notification.'),
      });
    } finally {
      setProcessingRpsId(null);
    }
  };

  const handleExecuteMandate = async (schedule) => {
    if (!canManage) return;
    const confirmMsg = `Execute mandate debit of ${formatCurrency(schedule.remainingAmount || schedule.emi)} for Installment #${schedule.installmentNumber}?`;
    if (!window.confirm(confirmMsg)) return;

    setProcessingRpsId(`exec_${schedule.id}`);
    setMessage(null);

    try {
      const res = await applicationsApi.executeMandate(schedule.id);
      setMessage({
        type: res?.status === 'SUCCESS' ? 'success' : res?.status === 'FAILURE' ? 'danger' : 'info',
        text: res?.message || `Mandate execution initiated: ${res?.status || 'IN_PROCESS'}`,
      });
      if (onChanged) onChanged();
    } catch (err) {
      setMessage({
        type: 'danger',
        text: apiError(err, 'Failed to execute mandate debit.'),
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
        type: 'danger',
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
            <Badge tone={
              activeMandate.status === 'AUTHORIZED' || activeMandate.status === 'COMPLETED'
                ? 'brand'
                : isMandateCancelled
                  ? 'neutral'
                  : 'caution'
            }>
              {activeMandate.mandateType} ({activeMandate.status})
            </Badge>
          )}
        </span>
      }
      description="View EMI schedule, mandate details, and trigger manual or scheduled AutoCollect debit requests."
      actions={
        activeMandate && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 shadow-sm">
              <span><strong className="text-ink">Mandate ID:</strong> {activeMandate.merchantTransactionId || activeMandate.providerMandateId || '-'}</span>
              <span>·</span>
              <span><strong className="text-ink">Max limit:</strong> {formatCurrency(activeMandate.amount)}</span>
            </div>
            {canManage && (
              <Button
                type="button"
                variant={isMandateCancelled ? 'secondary' : 'danger'}
                size="sm"
                disabled={isMandateCancelled || isCancellingMandate || Boolean(processingRpsId)}
                onClick={handleCancelMandate}
                title={isMandateCancelled ? `Mandate is already ${activeMandate.status}` : 'Cancel or revoke mandate on Easebuzz'}
              >
                {isCancellingMandate ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Cancelling…
                  </>
                ) : isMandateCancelled ? (
                  `Mandate ${activeMandate.status}`
                ) : (
                  <>
                    <Ban size={13} />
                    Cancel Mandate
                  </>
                )}
              </Button>
            )}
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
              const isNotifying = processingRpsId === `notif_${schedule.id}`;
              const isExecuting = processingRpsId === `exec_${schedule.id}`;
              const isReconciling = processingRpsId === `rec_${schedule.id}`;
              const isAnyProcessing = Boolean(processingRpsId);
              const debit = schedule.latestDebitRequest;

              const isCustomerNotified = Boolean(
                debit?.notificationRequestNumber ||
                (debit?.failureReason && debit.failureReason.toLowerCase().includes('pre-debit notification active')) ||
                (activeMandate?.mandateType && activeMandate.mandateType !== 'UPI')
              );

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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={DEBIT_STATUS_TONE[debit.status] || 'danger'}>{debit.status}</Badge>
                          <span className="text-xs text-neutral-500">
                            (Attempt #{debit.attemptNumber})
                          </span>
                          {isCustomerNotified && (
                            <span className="inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">
                              <CheckCircle2 size={11} /> Notified
                            </span>
                          )}
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
                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                      {debit && canManage && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isAnyProcessing}
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
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isAnyProcessing || !activeMandate}
                            onClick={() => handleSendNotification(schedule)}
                            title={
                              isCustomerNotified
                                ? 'Customer already notified. Click to re-send notification.'
                                : 'Send pre-debit notification to customer'
                            }
                          >
                            {isNotifying ? (
                              <>
                                <Loader2 size={13} className="animate-spin" />
                                Sending…
                              </>
                            ) : (
                              <>
                                <Bell size={13} />
                                Send notification
                              </>
                            )}
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            disabled={!isCustomerNotified || isAnyProcessing || !activeMandate}
                            onClick={() => handleExecuteMandate(schedule)}
                            title={
                              !isCustomerNotified
                                ? 'Send notification to customer first before executing mandate'
                                : 'Execute mandate debit presentment'
                            }
                          >
                            {isExecuting ? (
                              <>
                                <Loader2 size={13} className="animate-spin" />
                                Executing…
                              </>
                            ) : (
                              <>
                                <Zap size={13} />
                                Execute mandate
                              </>
                            )}
                          </Button>
                        </>
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
