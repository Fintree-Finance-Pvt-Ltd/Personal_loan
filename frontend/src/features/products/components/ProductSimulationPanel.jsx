import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input, Button, Alert } from '../../../components/ui';
import { productsApi } from '../api/products.api';
import { moneyStringSchema } from '../validation/product.schema';

const simulateSchema = z.object({
  completedLoans: z.coerce.number().int().min(0, 'Must be at least 0'),
  tenure: z.coerce.number().int().min(1, 'Must be at least 1'),
  lenderApprovedAmount: z.union([moneyStringSchema, z.literal('')]).transform(v => v === '' ? null : v).nullable(),
});

export function ProductSimulationPanel({ versionId, tenures = [], tenureType = 'MONTHS' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const defaultTenure = tenures.length > 0 ? tenures[0].tenure : (tenureType === 'DAYS' ? 30 : 12);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(simulateSchema),
    defaultValues: { completedLoans: 0, tenure: defaultTenure, lenderApprovedAmount: '' }
  });

  const onSubmit = async (payload) => {
    setBusy(true); setError(''); setResult(null);
    try {
      // Omit null values to match the API expectation (optional strings)
      const data = { completedLoans: payload.completedLoans, tenure: payload.tenure };
      if (payload.lenderApprovedAmount) data.lenderApprovedAmount = payload.lenderApprovedAmount;
      const res = await productsApi.simulateAmount(versionId, data);
      setResult(res);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Simulation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mt-4">
      <h5 className="font-semibold text-slate-900 mb-3">Pricing & Disbursal Simulation</h5>
      
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-4 mb-4">
        <Input label="Completed Loans" type="number" className="w-32" {...register('completedLoans')} error={errors.completedLoans?.message} />
        <Input label={`Tenure (${tenureType === 'DAYS' ? 'Days' : 'Months'})`} type="number" className="w-32" {...register('tenure')} error={errors.tenure?.message} />
        <Input label="Lender Approved (Opt)" placeholder="15000.00" className="w-48" {...register('lenderApprovedAmount')} error={errors.lenderApprovedAmount?.message} />
        <Button type="submit" disabled={busy}>{busy ? '...' : 'Simulate'}</Button>
      </form>

      {error && <Alert className="mb-4">{error}</Alert>}

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded p-4 text-sm font-mono space-y-2">
            <h6 className="font-semibold text-slate-700 border-b pb-1 mb-2">Loan Sizing</h6>
            <div className="flex justify-between"><span>Base Amount:</span><span>{result.baseAmount}</span></div>
            <div className="flex justify-between"><span>Multiplier (Min Loans {result.matchedMultiplier.minimumCompletedLoans}):</span><span>x {result.matchedMultiplier.multiplier}</span></div>
            <div className="flex justify-between"><span>Multiplied Amount:</span><span>{result.multipliedAmount}</span></div>
            <div className="border-t border-slate-100 my-1 pt-1 flex justify-between text-slate-500"><span>Product Max Cap:</span><span>{result.productCap}</span></div>
            <div className="flex justify-between text-slate-500"><span>Lender Cap:</span><span>{result.lenderApprovedAmount || 'None'}</span></div>
            <div className="border-t border-slate-100 my-1 pt-1 flex justify-between font-semibold text-slate-800"><span>Amount Before Rounding:</span><span>{result.amountBeforeRounding}</span></div>
            {result.roundingMethod !== 'NONE' && (
              <div className="flex justify-between text-slate-500">
                <span>Rounding ({result.roundingMethod} to {result.roundingUnit}):</span>
                <span>Applied</span>
              </div>
            )}
            <div className="border-t border-slate-200 my-1 pt-2 flex justify-between font-bold text-slate-800 text-base">
              <span>Final Principal Amount:</span><span>{result.finalPrincipalAmount}</span>
            </div>
          </div>
          
          <div className="bg-white border border-slate-200 rounded p-4 text-sm font-mono space-y-2">
            <h6 className="font-semibold text-slate-700 border-b pb-1 mb-2">Pricing & Deductions</h6>
            <div className="flex justify-between"><span>{tenureType === 'DAYS' ? 'Bullet Repayment' : 'EMI'} ({result.tenure} {tenureType === 'DAYS' ? 'days' : 'months'}, {result.interestMethod}):</span><span>{result.emiAmount}</span></div>
            <div className="flex justify-between"><span>Total Interest (ROI {result.annualRoiPercent}%):</span><span>{result.totalInterest}</span></div>
            
            <div className="border-t border-slate-100 my-1 pt-1 flex justify-between text-slate-500"><span>Processing Fee:</span><span>-{result.processingFeeAmount}</span></div>
            <div className="flex justify-between text-slate-500"><span>PF GST:</span><span>-{result.processingFeeGst}</span></div>
            <div className="flex justify-between text-slate-500"><span>Assessment Fee:</span><span>-{result.assessmentFeeAmount}</span></div>
            <div className="flex justify-between text-slate-500"><span>Assessment Fee GST:</span><span>-{result.assessmentFeeGst}</span></div>
            
            <div className="border-t border-slate-100 my-1 pt-1 flex justify-between font-semibold text-red-600">
              <span>Total Upfront Deductions:</span><span>-{result.totalDeductions}</span>
            </div>
            
            <div className="border-t border-slate-200 my-1 pt-2 flex justify-between font-bold text-brand-600 text-lg">
              <span>Net Disbursal Amount:</span><span>{result.netDisbursalAmount}</span>
            </div>
            
            <div className="border-t border-slate-200 my-1 pt-2 flex justify-between font-semibold text-slate-800 text-base">
              <span>Preview APR:</span><span>{result.aprPercent}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
