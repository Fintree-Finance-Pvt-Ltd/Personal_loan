import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PageHeader, Input, Select, Button, Alert, Spinner } from '../../../components/ui';
import { updateProductStrategySchema } from '../validation/product.schema';
import { productsApi } from '../api/products.api';
import { apiError } from '../../../lib/api';
import { Trash2, Plus } from 'lucide-react';

export function EditProductVersionPage() {
  const { productId, versionId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, setExpectedVersion] = useState(1);

  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm({
    resolver: zodResolver(updateProductStrategySchema),
    defaultValues: { expectedVersion: 1, multipliers: [], tenures: '', tenureType: 'MONTHS' }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'multipliers' });

  useEffect(() => {
    document.title = 'Edit Version Strategy — Admin Panel';
    const loadData = async () => {
      try {
        const product = await productsApi.getProduct(productId);
        const version = product.versions.find(v => v.id === versionId);
        if (!version) throw new Error('Version not found.');
        
        setExpectedVersion(version.version);
        reset({
          expectedVersion: version.version,
          minimumAmount: version.minimumAmount,
          firstLoanBaseAmount: version.firstLoanBaseAmount,
          maximumAmountCap: version.maximumAmountCap,
          repeatTierScope: version.repeatTierScope,
          roundingMethod: version.roundingMethod,
          roundingUnit: version.roundingUnit || '',
          effectiveFrom: version.effectiveFrom || '',
          interestMethod: version.interestMethod || 'REDUCING_BALANCE',
          annualRoiPercent: version.annualRoiPercent || '24.00',
          processingFeePercent: version.processingFeePercent || '2.00',
          processingFeeGstPercent: version.processingFeeGstPercent || '18.00',
          assessmentFeeAmount: version.assessmentFeeAmount || '500.00',
          assessmentFeeGstPercent: version.assessmentFeeGstPercent || '18.00',
          penalChargeAmount: version.penalChargeAmount || '50.00',
          bounceChargeAmount: version.bounceChargeAmount || '250.00',
          emiDueDay: version.emiDueDay || 5,
          includeAssessmentFeeInApr: version.includeAssessmentFeeInApr || false,
          tenureType: version.tenureType || 'MONTHS',
          tenures: version.tenures ? version.tenures.map(t => t.tenure).join(', ') : '',
          multipliers: version.multipliers ? version.multipliers.map(m => ({
            minimumCompletedLoans: m.minimumCompletedLoans,
            multiplier: m.multiplier,
          })) : []
        });
      } catch (err) {
        setError(apiError(err, 'Failed to load version details.'));
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [productId, versionId, reset]);

  const roundingMethod = watch('roundingMethod');
  const tenureType = watch('tenureType');

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

  const onSubmit = async (payload) => {
    setBusy(true); setError('');
    try {
      await productsApi.updateProductStrategy(versionId, payload);
      
      navigate(`/admin-master/products/${productId}`, {
        replace: true,
        state: { message: 'Version strategy updated successfully.' }
      });
    } catch (requestError) {
      setError(apiError(requestError, 'Unable to update version. Please refresh if a conflict occurred.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner label="Loading..." /></div>;

  return (
    <>
      <PageHeader
        title="Edit Version Strategy"
        description="Update the pricing strategy and offer multipliers for this Draft or Rejected version."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 mt-6">
        {error && <Alert>{error}</Alert>}
        {errorList.length > 0 && (
          <Alert tone="error">
            <strong>Validation blocked saving:</strong>
            <ul className="list-disc pl-5 mt-1 text-xs">
              {errorList.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </Alert>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Amount Rules</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Input label="Minimum Amount" {...register('minimumAmount')} error={errors.minimumAmount?.message} />
            <Input label="Base Amount (1st Loan)" {...register('firstLoanBaseAmount')} error={errors.firstLoanBaseAmount?.message} />
            <Input label="Maximum Cap" {...register('maximumAmountCap')} error={errors.maximumAmountCap?.message} />
            
            <Select label="Repeat Tier Scope" {...register('repeatTierScope')} error={errors.repeatTierScope?.message}>
              <option value="SAME_LENDER">Same Lender Only</option>
              <option value="PLATFORM_WIDE">Platform Wide</option>
            </Select>

            <Select label="Rounding Method" {...register('roundingMethod')} error={errors.roundingMethod?.message}>
              <option value="NONE">None</option>
              <option value="FLOOR">Floor</option>
              <option value="NEAREST">Nearest</option>
              <option value="CEIL">Ceil</option>
            </Select>
            
            <Input label="Rounding Unit" disabled={roundingMethod === 'NONE'} {...register('roundingUnit')} error={errors.roundingUnit?.message} />
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mt-6">
            <Select label="Interest Calculation" {...register('interestMethod')} error={errors.interestMethod?.message}>
              <option value="REDUCING_BALANCE">Reducing Balance</option>
              <option value="FLAT_RATE">Flat Rate</option>
            </Select>
            <Input label="Annual ROI (%)" {...register('annualRoiPercent')} error={errors.annualRoiPercent?.message} />
            <Input label="EMI Due Day" type="number" {...register('emiDueDay')} error={errors.emiDueDay?.message} />
            
            <Input label="Processing Fee (%)" {...register('processingFeePercent')} error={errors.processingFeePercent?.message} />
            <Input label="PF GST (%)" {...register('processingFeeGstPercent')} error={errors.processingFeeGstPercent?.message} />
            <div className="hidden sm:block"></div>
            
            <Input label="Assessment Fee (Fixed)" {...register('assessmentFeeAmount')} error={errors.assessmentFeeAmount?.message} />
            <Input label="Assessment Fee GST (%)" {...register('assessmentFeeGstPercent')} error={errors.assessmentFeeGstPercent?.message} />
            <div className="hidden sm:block"></div>

            <Input label="Penal Charge (Per Day)" {...register('penalChargeAmount')} error={errors.penalChargeAmount?.message} />
            <Input label="Bounce Charge" {...register('bounceChargeAmount')} error={errors.bounceChargeAmount?.message} />

            <div className="sm:col-span-3 mt-2">
              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="radio" value="MONTHS" {...register('tenureType')} /> Months
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="radio" value="DAYS" {...register('tenureType')} /> Days
                </label>
              </div>
              <Input label={`Supported Tenures (comma-separated ${tenureType === 'DAYS' ? 'days' : 'months'})`} placeholder={tenureType === 'DAYS' ? '15, 30, 45' : '3, 6, 12'} {...register('tenures')} error={errors.tenures?.message} />
            </div>
            
            <div className="sm:col-span-3">
              <Input label="Effective From (Optional UTC DateTime)" placeholder="YYYY-MM-DDTHH:mm:ssZ" {...register('effectiveFrom')} error={errors.effectiveFrom?.message} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-slate-900">Offer Multipliers</h3>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ minimumCompletedLoans: fields.length, multiplier: '1.2500' })}>
              <Plus className="mr-1 h-4 w-4" /> Add Multiplier
            </Button>
          </div>
          {errors.multipliers?.message && <Alert className="mb-4">{errors.multipliers.message}</Alert>}
          
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-wrap items-start gap-4 p-4 border border-slate-100 rounded-xl bg-slate-50 relative">
                <Input label="Min Completed Loans" type="number" className="w-40" {...register(`multipliers.${index}.minimumCompletedLoans`)} error={errors.multipliers?.[index]?.minimumCompletedLoans?.message} />
                <Input label="Multiplier" className="w-40" {...register(`multipliers.${index}.multiplier`)} error={errors.multipliers?.[index]?.multiplier?.message} />
                
                {index > 0 && (
                  <button type="button" onClick={() => remove(index)} className="mt-8 text-slate-400 hover:text-red-600 transition-colors">
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-6">
          <Button type="button" variant="secondary" onClick={() => navigate(`/admin-master/products/${productId}`)} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Strategy'}</Button>
        </div>
      </form>
    </>
  );
}
