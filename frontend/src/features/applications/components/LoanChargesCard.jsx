import { useState } from 'react';
import { applicationsApi } from '../api/applications.api';
import { apiError } from '../../../lib/api';
import { Alert, Button, Card, Input, Textarea } from '../../../components/ui';
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
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Charge type" placeholder="e.g. Bounce Charge" value={chargeType} onChange={(e) => setChargeType(e.target.value)} required />
        <Input label="Amount (₹)" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
      </div>
      <Textarea label="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Charge'}</Button>
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
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
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
      <p className="text-xs text-slate-500">Outstanding on this charge: {formatCurrency(charge.remainingAmount)}</p>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Waiving…' : 'Waive Charge'}</Button>
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
    <Card className="mb-6 !p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
        <div>
          <div className="font-bold text-gray-700">Loan Charges</div>
          <p className="mt-1 text-sm text-gray-500">Extra charges (bounce, penal, etc.) reported to the lender.</p>
        </div>
        {canManage && !addingCharge && (
          <Button type="button" onClick={() => setAddingCharge(true)} className="!px-3 !py-2 text-sm">
            + Add Charge
          </Button>
        )}
      </div>

      {addingCharge && (
        <div className="px-6 pt-4">
          <AddChargeForm lan={lan} onCancel={() => setAddingCharge(false)} onSaved={handleSaved} />
        </div>
      )}

      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remaining</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {charges.length === 0 ? (
            <tr>
              <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                No charges on this loan.
              </td>
            </tr>
          ) : (
            charges.map((charge) => (
              <tr key={charge.chargeId} className="align-top hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-medium">{charge.chargeType}</div>
                  {charge.description && <div className="text-xs text-gray-500">{charge.description}</div>}
                  {charge.waivers.length > 0 && (
                    <div className="mt-1 text-xs text-gray-500">
                      Waived: {formatCurrency(charge.waivers.reduce((sum, w) => sum + w.waiverAmount, 0))}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">{formatCurrency(charge.amount)}</td>
                <td className="px-6 py-4">{formatCurrency(charge.remainingAmount)}</td>
                <td className="px-6 py-4"><StageStatusBadge value={charge.status} /></td>
                <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(charge.dueDate)}</td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  {canManage && ['PENDING', 'PARTIAL'].includes(charge.status) && waivingChargeId !== charge.chargeId && (
                    <button
                      type="button"
                      onClick={() => setWaivingChargeId(charge.chargeId)}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      Waive
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {waivingChargeId && (
        <div className="px-6 pb-4">
          <WaiveChargeForm
            lan={lan}
            charge={charges.find((c) => c.chargeId === waivingChargeId)}
            onCancel={() => setWaivingChargeId(null)}
            onSaved={handleSaved}
          />
        </div>
      )}
    </Card>
  );
}
