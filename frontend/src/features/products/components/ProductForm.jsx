import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input, Textarea, Select, Button, Alert } from '../../../components/ui';
import { createProductSchema } from '../validation/product.schema';
import { getLenders } from '../../lenders/api/lenders.api';
import { Trash2, Plus } from 'lucide-react';

export function ProductForm({ busy, serverError, onSubmit, onCancel }) {
  const [lenders, setLenders] = useState([]);

  useEffect(() => {
    // Only approved lenders are allowed
    getLenders({ status: 'APPROVED', limit: 100 })
      .then(res => setLenders(res.items || []))
      .catch(() => {});
  }, []);

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      lenderId: '',
      strategy: {
        minimumAmount: '5000.00',
        firstLoanBaseAmount: '10000.00',
        maximumAmountCap: '25000.00',
        repeatTierScope: 'SAME_LENDER',
        roundingMethod: 'FLOOR',
        roundingUnit: '500.00',
        effectiveFrom: '',
        tiers: [
          { completedLoansFrom: 0, completedLoansTo: 0, multiplier: '1.0000', tierCap: '' }
        ]
      }
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'strategy.tiers'
  });

  const roundingMethod = watch('strategy.roundingMethod');

  const getErrorMessages = (obj, prefix = '') => {
    if (!obj) return [];
    let messages = [];
    for (const key in obj) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (obj[key]?.message) {
        messages.push(`${path}: ${obj[key].message}`);
      } else if (typeof obj[key] === 'object' && obj[key] !== null && !obj[key].ref) {
        messages.push(...getErrorMessages(obj[key], path));
      }
    }
    return messages;
  };
  const errorList = getErrorMessages(errors);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {serverError && <Alert>{serverError}</Alert>}
      {errorList.length > 0 && (
        <Alert tone="error">
          <strong>Validation blocked saving:</strong>
          <ul className="list-disc pl-5 mt-1 text-xs">
            {errorList.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </Alert>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Product Identity</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Select label="Lender" {...register('lenderId')} error={errors.lenderId?.message}>
            <option value="">Select an APPROVED lender</option>
            {lenders.map(l => <option key={l.id} value={l.id}>{l.displayName} ({l.code})</option>)}
          </Select>
          <Input label="Product Name" placeholder="e.g. Premium Loan" {...register('name')} error={errors.name?.message} />
          <Input label="Product Code" placeholder="e.g. PREM-PL" {...register('code')} error={errors.code?.message} className="uppercase" />
          <div className="sm:col-span-2">
            <Textarea label="Description (Optional)" placeholder="Short description..." {...register('description')} error={errors.description?.message} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Initial Version Strategy</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Input label="Minimum Amount" placeholder="5000.00" {...register('strategy.minimumAmount')} error={errors.strategy?.minimumAmount?.message} />
          <Input label="Base Amount (1st Loan)" placeholder="10000.00" {...register('strategy.firstLoanBaseAmount')} error={errors.strategy?.firstLoanBaseAmount?.message} />
          <Input label="Maximum Cap" placeholder="25000.00" {...register('strategy.maximumAmountCap')} error={errors.strategy?.maximumAmountCap?.message} />
          
          <Select label="Repeat Tier Scope" {...register('strategy.repeatTierScope')} error={errors.strategy?.repeatTierScope?.message}>
            <option value="SAME_LENDER">Same Lender Only</option>
            <option value="PLATFORM_WIDE">Platform Wide</option>
          </Select>

          <Select label="Rounding Method" {...register('strategy.roundingMethod')} error={errors.strategy?.roundingMethod?.message}>
            <option value="NONE">None</option>
            <option value="FLOOR">Floor</option>
            <option value="NEAREST">Nearest</option>
            <option value="CEIL">Ceil</option>
          </Select>
          
          <Input label="Rounding Unit" placeholder="500.00" disabled={roundingMethod === 'NONE'} {...register('strategy.roundingUnit')} error={errors.strategy?.roundingUnit?.message} />

          <div className="sm:col-span-3">
            <Input label="Effective From (Optional UTC DateTime)" placeholder="YYYY-MM-DDTHH:mm:ssZ" {...register('strategy.effectiveFrom')} error={errors.strategy?.effectiveFrom?.message} />
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-medium text-slate-900">Offer Tiers</h4>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ completedLoansFrom: fields.length, completedLoansTo: '', multiplier: '1.2500', tierCap: '' })}>
              <Plus className="mr-1 h-4 w-4" /> Add Tier
            </Button>
          </div>
          {errors.strategy?.tiers?.message && <Alert className="mb-4">{errors.strategy.tiers.message}</Alert>}
          
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-wrap items-start gap-4 p-4 border border-slate-100 rounded-xl bg-slate-50 relative">
                <Input label="Loans From" type="number" className="w-24" {...register(`strategy.tiers.${index}.completedLoansFrom`)} error={errors.strategy?.tiers?.[index]?.completedLoansFrom?.message} />
                <Input label="Loans To (Blank=∞)" type="number" className="w-24" {...register(`strategy.tiers.${index}.completedLoansTo`)} error={errors.strategy?.tiers?.[index]?.completedLoansTo?.message} />
                <Input label="Multiplier" placeholder="1.2500" className="w-32" {...register(`strategy.tiers.${index}.multiplier`)} error={errors.strategy?.tiers?.[index]?.multiplier?.message} />
                <Input label="Tier Cap (Opt)" placeholder="15000.00" className="w-32" {...register(`strategy.tiers.${index}.tierCap`)} error={errors.strategy?.tiers?.[index]?.tierCap?.message} />
                
                {index > 0 && (
                  <button type="button" onClick={() => remove(index)} className="mt-8 text-slate-400 hover:text-red-600 transition-colors">
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-6">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Create product'}</Button>
      </div>
    </form>
  );
}
