import { useState } from 'react';
import { Alert, Button, Spinner } from '../../../components/ui';

export function DisableUserDialog({ open, userName, onConfirm, onCancel, busy }) {
  const [confirmed, setConfirmed] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" role="alertdialog" aria-modal="true">
        <h2 className="text-lg font-bold text-slate-900">Disable user account?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          You are about to disable <strong>{userName}</strong>. This will:
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 space-y-1">
          <li>Immediately revoke all active sessions and refresh tokens</li>
          <li>Prevent the user from logging in</li>
          <li>Preserve user data and role assignments</li>
        </ul>
        <label className="mt-5 flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-red-600" />
          I understand this will terminate all active sessions
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={busy || !confirmed}>
            {busy ? <Spinner label="Disabling" /> : 'Disable account'}
          </Button>
        </div>
      </div>
    </div>
  );
}
