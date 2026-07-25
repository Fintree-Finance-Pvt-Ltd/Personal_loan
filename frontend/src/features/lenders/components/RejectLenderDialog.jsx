import { useEffect, useState } from 'react';
import { Alert, Button, Spinner } from '../../../components/ui';

export function RejectLenderDialog({
  open,
  lenderName,
  busy,
  error,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setValidationError('');
    }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const normalized = reason.trim();

    if (normalized.length < 5) {
      setValidationError('Enter a rejection reason of at least 5 characters.');
      return;
    }

    setValidationError('');
    onConfirm(normalized);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-lender-title"
      >
        <h2 id="reject-lender-title" className="text-lg font-bold text-ink">
          Reject lender
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Provide a clear reason for rejecting {lenderName}. The maker will see
          this reason before correcting and resubmitting the lender.
        </p>

        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Rejection reason *
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={5}
            className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-slate-900 shadow-sm focus:border-brand-600"
            placeholder="Explain what must be corrected"
          />
        </label>

        <div className="mt-1 flex items-start justify-between gap-3 text-xs">
          <span className="text-red-700">{validationError}</span>
          <span className="shrink-0 text-slate-400">{reason.length}/500</span>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={submit} disabled={busy}>
            {busy ? <Spinner label="Rejecting" /> : 'Reject lender'}
          </Button>
        </div>
      </div>
    </div>
  );
}
