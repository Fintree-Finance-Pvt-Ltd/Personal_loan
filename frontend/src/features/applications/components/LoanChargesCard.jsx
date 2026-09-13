import { useState } from 'react';
import { Plus } from 'lucide-react';
import { applicationsApi } from '../api/applications.api';
import { apiError } from '../../../lib/api';
import { Alert, Button, Input, Panel, TableShell, Textarea } from '../../../components/ui';
import { StageStatusBadge } from './StageStatusBadge';

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '-';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-IN') : '-';
}

function AddChargeForm({ lan, onCancel, onSaved }) {
  const [chargeType, setChargeType] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await applicationsApi.addLoanCharge(lan, { chargeType, amount, dueDate, remarks });
      onSaved();
    } catch (err) {
      setError(apiError(err, 'Unable to add charge.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Charge type" placeholder="e.g. Bounce Charge" value={chargeType} onChange={(e) => setChargeType(e.target.value)} required />
        <Input label="Amount (₹)" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
      </div>
      <Textarea label="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? 'Adding…' : 'Add charge'}</Button>
      </div>
    </form>
  );
}

function WaiveChargeForm({ lan, charge, onCancel, onSaved }) {
  const [waiverAmount, setWaiverAmount] = useState(String(charge.remainingAmount));
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await applicationsApi.waiveLoanCharge(lan, charge.chargeId, { waiverAmount, remarks });
      onSaved();
    } catch (err) {
      setError(apiError(err, 'Unable to waive charge.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Waiver amount (₹)"
          type="number"
          min="0.01"
          max={charge.remainingAmount}
          step="0.01"
          value={waiverAmount}
          onChange={(e) => setWaiverAmount(e.target.value)}
          required
        />
      </div>
      <Textarea label="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
      <p className="text-xs text-neutral-500">Outstanding on this charge: {formatCurrency(charge.remainingAmount)}</p>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? 'Waiving…' : 'Waive charge'}</Button>
      </div>
    </form>
  );
}

export function LoanChargesCard({ lan, charges, canManage, onChanged }) {
  const [addingCharge, setAddingCharge] = useState(false);
  const [waivingChargeId, setWaivingChargeId] = useState(null);

  const handleSaved = () => {
    setAddingCharge(false);
    setWaivingChargeId(null);
    onChanged();
  };

  return (
    <Panel
      className="mb-6"
      title="Loan charges"
      description="Extra charges (bounce, penal, etc.) reported to the lender."
      actions={
        canManage && !addingCharge && (
          <Button type="button" size="sm" onClick={() => setAddingCharge(true)}>
            <Plus size={13} /> Add charge
          </Button>
        )
      }
    >
      {addingCharge && (
        <AddChargeForm lan={lan} onCancel={() => setAddingCharge(false)} onSaved={handleSaved} />
      )}

      <div className={addingCharge ? 'mt-4' : ''}>
        {charges.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">No charges on this loan.</p>
        ) : (
          <TableShell>
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Type</th>
                <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Amount</th>
                <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Remaining</th>
                <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Status</th>
                <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Due</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {charges.map((charge) => (
                <tr key={charge.chargeId} className="align-top hover:bg-neutral-50/70">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-ink">{charge.chargeType}</div>
                    {charge.description && <div className="text-xs text-neutral-500">{charge.description}</div>}
                    {charge.waivers.length > 0 && (
                      <div className="mt-1 text-xs text-neutral-500">
                        Waived: {formatCurrency(charge.waivers.reduce((sum, w) => sum + w.waiverAmount, 0))}
                      </div>
                    )}
                  </td>
                  <td className="font-numeric px-5 py-3.5">{formatCurrency(charge.amount)}</td>
                  <td className="font-numeric px-5 py-3.5">{formatCurrency(charge.remainingAmount)}</td>
                  <td className="px-5 py-3.5"><StageStatusBadge value={charge.status} /></td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-neutral-500">{formatDate(charge.dueDate)}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right">
                    {canManage && ['PENDING', 'PARTIAL'].includes(charge.status) && waivingChargeId !== charge.chargeId && (
                      <Button type="button" size="sm" onClick={() => setWaivingChargeId(charge.chargeId)}>
                        Waive
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </div>

      {waivingChargeId && (
        <WaiveChargeForm
          lan={lan}
          charge={charges.find((c) => c.chargeId === waivingChargeId)}
          onCancel={() => setWaivingChargeId(null)}
          onSaved={handleSaved}
        />
      )}
    </Panel>
  );
}
