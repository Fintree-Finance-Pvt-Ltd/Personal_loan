import { useEffect, useState } from 'react';
import { Alert, Button, Spinner } from '../../../components/ui';
import { getRoles } from '../../roles/api/roles.api';

export function AssignRolesDialog({ open, currentRoleIds, onConfirm, onCancel, busy }) {
  const [allRoles, setAllRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(currentRoleIds ?? []);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(currentRoleIds ?? []);
    setLoading(true); setError('');
    getRoles({ status: 'ACTIVE', limit: 100 })
      .then(data => setAllRoles(data.items))
      .catch(() => setError('Failed to load roles.'))
      .finally(() => setLoading(false));
  }, [open, currentRoleIds]);

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900">Assign roles</h2>
        <p className="mt-1 text-sm text-slate-500">Select one or more active roles for this user.</p>

        {error && <Alert className="mt-3">{error}</Alert>}
        {loading ? (
          <div className="flex justify-center py-10 text-brand-700"><Spinner label="Loading roles" /></div>
        ) : (
          <div className="mt-4 max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
            {allRoles.map(role => (
              <label key={role.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(role.id)}
                  onChange={() => toggle(role.id)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                <div>
                  <p className="font-semibold text-sm text-slate-900">{role.name}</p>
                  <p className="font-mono text-xs text-slate-400">{role.code}</p>
                </div>
              </label>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">{selected.length} role{selected.length !== 1 ? 's' : ''} selected</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={() => onConfirm(selected)} disabled={busy || selected.length === 0}>
            {busy ? <Spinner label="Saving" /> : 'Save roles'}
          </Button>
        </div>
      </div>
    </div>
  );
}
