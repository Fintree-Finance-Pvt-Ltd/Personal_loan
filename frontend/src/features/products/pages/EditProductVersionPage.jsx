import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PageHeader, Input, Select, Button, Alert, Spinner } from '../../../components/ui';
import { productStrategySchema } from '../validation/product.schema';
import { productsApi } from '../api/products.api';
import { apiError } from '../../../lib/api';
import { Trash2, Plus } from 'lucide-react';

export function EditProductVersionPage() {
  const { productId, versionId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expectedVersion, setExpectedVersion] = useState(1);

  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm({
    resolver: zodResolver(productStrategySchema),
    defaultValues: { tiers: [] }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'tiers' });

  useEffect(() => {
    document.title = 'Edit Version Strategy — Admin Panel';
    const loadData = async () => {
      try {
        const product = await productsApi.getProduct(productId);
        const version = product.versions.find(v => v.id === versionId);
        if (!version) throw new Error('Version not found.');
        
        setExpectedVersion(version.version);
        reset({
          minimumAmount: version.minimumAmount,
          firstLoanBaseAmount: version.firstLoanBaseAmount,
          maximumAmountCap: version.maximumAmountCap,
          repeatTierScope: version.repeatTierScope,
          roundingMethod: version.roundingMethod,
          roundingUnit: version.roundingUnit || '',
          effectiveFrom: version.effectiveFrom || '',
          tiers: version.offerTiers.map(t => ({
            completedLoansFrom: t.completedLoansFrom,
            completedLoansTo: t.completedLoansTo === null ? '' : t.completedLoansTo,
            multiplier: t.multiplier,
            tierCap: t.tierCap || ''
          }))
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

  const onSubmit = async (payload) => {
    setBusy(true); setError('');
    try {
      const { tiers, ...strategyConfig } = payload;
      
      // Update amounts and config
      await productsApi.updateProductVersion(versionId, {
        expectedVersion,
        ...strategyConfig
      });
      
      // Update tiers in a separate call but optimistically expecting the version has incremented
      await productsApi.replaceOfferTiers(versionId, {
        expectedVersion: expectedVersion + 1,
        tiers
      });

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
        description="Update the pricing strategy and offer tiers for this Draft or Rejected version."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {error && <Alert>{error}</Alert>}

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
            <div className="sm:col-span-3">
              <Input label="Effective From (Optional UTC DateTime)" placeholder="YYYY-MM-DDTHH:mm:ssZ" {...register('effectiveFrom')} error={errors.effectiveFrom?.message} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-slate-900">Offer Tiers</h3>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ completedLoansFrom: fields.length, completedLoansTo: '', multiplier: '1.2500', tierCap: '' })}>
              <Plus className="mr-1 h-4 w-4" /> Add Tier
            </Button>
          </div>
          {errors.tiers?.message && <Alert className="mb-4">{errors.tiers.message}</Alert>}
          
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-wrap items-start gap-4 p-4 border border-slate-100 rounded-xl bg-slate-50 relative">
                <Input label="Loans From" type="number" className="w-24" {...register(`tiers.${index}.completedLoansFrom`)} error={errors.tiers?.[index]?.completedLoansFrom?.message} />
                <Input label="Loans To (Blank=∞)" type="number" className="w-24" {...register(`tiers.${index}.completedLoansTo`)} error={errors.tiers?.[index]?.completedLoansTo?.message} />
                <Input label="Multiplier" placeholder="1.2500" className="w-32" {...register(`tiers.${index}.multiplier`)} error={errors.tiers?.[index]?.multiplier?.message} />
                <Input label="Tier Cap (Opt)" placeholder="15000.00" className="w-32" {...register(`tiers.${index}.tierCap`)} error={errors.tiers?.[index]?.tierCap?.message} />
                
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
