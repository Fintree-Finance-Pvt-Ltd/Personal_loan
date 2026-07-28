import { useEffect, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input, Textarea, Select, Button, Alert, Badge } from '../../../components/ui';
import { createProductSchema } from '../validation/product.schema';
import { getLenders } from '../../lenders/api/lenders.api';
import { platformProductsApi } from '../../platform-products/api/platform-products.api';
import { productsApi } from '../api/products.api';
import { Trash2, Plus } from 'lucide-react';

export function ProductForm({ busy, serverError, onSubmit, onCancel }) {
  const [lenders, setLenders] = useState([]);
  const [platformProducts, setPlatformProducts] = useState([]);
  const [mappedPlatformProductIds, setMappedPlatformProductIds] = useState(new Set());
  
  const [loadingLenders, setLoadingLenders] = useState(true);
  const [loadingPlatformProducts, setLoadingPlatformProducts] = useState(true);
  const [loadingMappings, setLoadingMappings] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getLenders({ status: 'APPROVED', limit: 100 }, controller.signal)
      .then(res => setLenders(res.items || []))
      .catch(() => {})
      .finally(() => setLoadingLenders(false));
      
    platformProductsApi.listPlatformProducts({ status: 'ACTIVE' }, controller.signal)
      .then(res => setPlatformProducts(res || []))
      .catch(() => {})
      .finally(() => setLoadingPlatformProducts(false));

    return () => controller.abort();
  }, []);

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      lenderId: '',
      platformProductId: '',
      description: '',
      strategy: {
        minimumAmount: '5000.00',
        firstLoanBaseAmount: '10000.00',
        maximumAmountCap: '25000.00',
        repeatTierScope: 'SAME_LENDER',
        roundingMethod: 'FLOOR',
        roundingUnit: '500.00',
        effectiveFrom: '',
        
        interestMethod: 'REDUCING_BALANCE',
        annualRoiPercent: '24.00',
        processingFeePercent: '2.00',
        processingFeeGstPercent: '18.00',
        assessmentFeeAmount: '500.00',
        assessmentFeeGstPercent: '18.00',
        penalChargeAmount: '50.00',
        bounceChargeAmount: '250.00',
        emiDueDay: 5,
        includeAssessmentFeeInApr: false,
        
        tenureType: 'MONTHS',
        tenures: '3, 6, 9, 12',
        
        multipliers: [
          { minimumCompletedLoans: 0, multiplier: '1.0000' }
        ]
      }
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'strategy.multipliers'
  });

  const roundingMethod = watch('strategy.roundingMethod');
  const tenureType = watch('strategy.tenureType');
  const selectedLenderId = watch('lenderId');
  const selectedPlatformProductId = watch('platformProductId');
  
  const selectedPlatformProductDetails = platformProducts.find(p => p.id === selectedPlatformProductId);

  useEffect(() => {
    if (!selectedLenderId) {
      setMappedPlatformProductIds(new Set());
      setValue('platformProductId', '');
      return;
    }

    const controller = new AbortController();
    setLoadingMappings(true);
    
    // Clear platform product selection when lender changes
    setValue('platformProductId', '');
    
    productsApi.listProducts({ lenderId: selectedLenderId, limit: 100 }, controller.signal)
      .then(res => {
        const mapped = new Set((res.items || []).map(p => p.platformProductId));
        setMappedPlatformProductIds(mapped);
      })
      .catch(() => {})
      .finally(() => setLoadingMappings(false));
      
    return () => controller.abort();
  }, [selectedLenderId, setValue]);

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

  const onValidSubmit = (data) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(onValidSubmit)} className="space-y-6">
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
          
          <Select 
            label="1. Select Lender" 
            {...register('lenderId')} 
            error={errors.lenderId?.message}
            disabled={loadingLenders}
          >
            <option value="">{loadingLenders ? 'Loading lenders...' : 'Select an APPROVED lender'}</option>
            {lenders.map(l => <option key={l.id} value={l.id}>{l.displayName} ({l.code})</option>)}
          </Select>
          
          <Select 
            label="2. Select Platform Product" 
            {...register('platformProductId')} 
            error={errors.platformProductId?.message}
            disabled={!selectedLenderId || loadingPlatformProducts || loadingMappings}
          >
            <option value="">
              {!selectedLenderId 
                ? 'Select a lender first' 
                : loadingMappings || loadingPlatformProducts 
                  ? 'Loading catalog...' 
                  : 'Select an ACTIVE platform product'}
            </option>
            {platformProducts.map(p => {
              const isMapped = mappedPlatformProductIds.has(p.id);
              return (
                <option key={p.id} value={p.id} disabled={isMapped}>
                  {p.name} ({p.code}) {isMapped ? ' - Already mapped' : ''}
                </option>
              );
            })}
          </Select>

          {selectedPlatformProductDetails && (
            <div className="sm:col-span-2 mt-2 rounded-xl bg-slate-50 p-4 border border-slate-200">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Selected Platform Product Details</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 block">Name</span>
                  <span className="font-semibold text-slate-900">{selectedPlatformProductDetails.name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Code</span>
                  <span className="font-semibold text-slate-900">{selectedPlatformProductDetails.code}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Status</span>
                  <Badge tone="success">{selectedPlatformProductDetails.status}</Badge>
                </div>
                <div>
                  <span className="text-slate-500 block">Description</span>
                  <span className="text-slate-700">{selectedPlatformProductDetails.description || 'N/A'}</span>
                </div>
              </div>
            </div>
          )}

          <div className="sm:col-span-2">
            <Textarea 
              label="Lender-Specific Product Description (Optional)" 
              placeholder="Short description... If left blank, it will inherit from the Platform Product." 
              {...register('description')} 
              error={errors.description?.message} 
            />
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
        </div>
        
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mt-6">
          <Select label="Interest Calculation" {...register('strategy.interestMethod')} error={errors.strategy?.interestMethod?.message}>
            <option value="REDUCING_BALANCE">Reducing Balance</option>
            <option value="FLAT_RATE">Flat Rate</option>
          </Select>
          <Input label="Annual ROI (%)" placeholder="24.00" {...register('strategy.annualRoiPercent')} error={errors.strategy?.annualRoiPercent?.message} />
          <Input label="EMI Due Day" type="number" placeholder="5" {...register('strategy.emiDueDay')} error={errors.strategy?.emiDueDay?.message} />
          
          <Input label="Processing Fee (%)" placeholder="2.00" {...register('strategy.processingFeePercent')} error={errors.strategy?.processingFeePercent?.message} />
          <Input label="PF GST (%)" placeholder="18.00" {...register('strategy.processingFeeGstPercent')} error={errors.strategy?.processingFeeGstPercent?.message} />
          <div className="hidden sm:block"></div>
          
          <Input label="Assessment Fee (Fixed)" placeholder="500.00" {...register('strategy.assessmentFeeAmount')} error={errors.strategy?.assessmentFeeAmount?.message} />
          <Input label="Assessment Fee GST (%)" placeholder="18.00" {...register('strategy.assessmentFeeGstPercent')} error={errors.strategy?.assessmentFeeGstPercent?.message} />
          <div className="hidden sm:block"></div>

          <Input label="Penal Charge (Per Day)" placeholder="50.00" {...register('strategy.penalChargeAmount')} error={errors.strategy?.penalChargeAmount?.message} />
          <Input label="Bounce Charge" placeholder="250.00" {...register('strategy.bounceChargeAmount')} error={errors.strategy?.bounceChargeAmount?.message} />

          <div className="sm:col-span-3 mt-2">
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="radio" value="MONTHS" {...register('strategy.tenureType')} /> Months
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="radio" value="DAYS" {...register('strategy.tenureType')} /> Days
              </label>
            </div>
            <Input label={`Supported Tenures (comma-separated ${tenureType === 'DAYS' ? 'days' : 'months'})`} placeholder={tenureType === 'DAYS' ? '15, 30, 45' : '3, 6, 12'} {...register('strategy.tenures')} error={errors.strategy?.tenures?.message} />
            <p className="text-xs text-slate-500 mt-1">E.g., "{tenureType === 'DAYS' ? '15, 30, 45' : '3, 6, 9, 12'}". These will be the only allowed terms.</p>
          </div>
          
          <div className="sm:col-span-3">
            <Input label="Effective From (Optional UTC DateTime)" placeholder="YYYY-MM-DDTHH:mm:ssZ" {...register('strategy.effectiveFrom')} error={errors.strategy?.effectiveFrom?.message} />
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-medium text-slate-900">Offer Multipliers</h4>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ minimumCompletedLoans: fields.length, multiplier: '1.2500' })}>
              <Plus className="mr-1 h-4 w-4" /> Add Multiplier
            </Button>
          </div>
          {errors.strategy?.multipliers?.message && <Alert className="mb-4">{errors.strategy.multipliers.message}</Alert>}
          
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-wrap items-start gap-4 p-4 border border-slate-100 rounded-xl bg-slate-50 relative">
                <Input label="Min Completed Loans" type="number" className="w-40" {...register(`strategy.multipliers.${index}.minimumCompletedLoans`)} error={errors.strategy?.multipliers?.[index]?.minimumCompletedLoans?.message} />
                <Input label="Multiplier" placeholder="1.2500" className="w-40" {...register(`strategy.multipliers.${index}.multiplier`)} error={errors.strategy?.multipliers?.[index]?.multiplier?.message} />
                
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
