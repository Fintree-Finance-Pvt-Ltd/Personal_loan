import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ruleEditorSchema } from '../validation/platform-policy.schema';
import { Button } from '../../../components/ui';
import { PlusIcon, TrashIcon } from 'lucide-react';

export default function PolicyRulesEditor({ initialRules, catalog, onSave }) {
  const initialFormRules = initialRules.length > 0 
    ? initialRules.map(r => ({
        ruleCode: r.ruleCode,
        operator: r.operator,
        expectedValue: r.expectedValue ?? '',
        failureOutcome: r.failureOutcome,
        reasonCode: r.reasonCode,
        customerMessage: r.customerMessage,
        internalMessage: r.internalMessage || '',
        isActive: r.isActive
      }))
    : catalog.filter(c => c.isMandatory).map(c => ({
        ruleCode: c.ruleCode,
        operator: c.supportedOperators[0],
        expectedValue: '',
        failureOutcome: 'FAIL',
        reasonCode: `${c.ruleName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_FAILED`,
        customerMessage: `Does not meet ${c.ruleName.toLowerCase()} requirement.`,
        internalMessage: '',
        isActive: true
      }));

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(ruleEditorSchema),
    defaultValues: { rules: initialFormRules }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'rules'
  });

  const watchRules = watch('rules');

  const getRuleDef = (code) => catalog.find(c => c.ruleCode === code);

  const onSubmit = (data) => {
    // Process expectedValue based on type
    const processedRules = data.rules.map(rule => {
      const def = getRuleDef(rule.ruleCode);
      let parsedValue = rule.expectedValue;
      
      if (def?.valueType === 'BOOLEAN' || def?.supportedOperators.includes('IS_TRUE') || def?.supportedOperators.includes('IS_FALSE')) {
        parsedValue = null;
      } else if (def?.valueType === 'INTEGER') {
        parsedValue = parsedValue ? parseInt(parsedValue, 10) : null;
      } else if (def?.valueType === 'DECIMAL') {
        parsedValue = parsedValue ? parseFloat(parsedValue) : null; // Backend expects string/number for decimal
      } else if (def?.valueType === 'STRING_ARRAY') {
        parsedValue = typeof parsedValue === 'string' ? parsedValue.split(',').map(s => s.trim()) : parsedValue;
      }
      
      return {
        ...rule,
        expectedValue: parsedValue
      };
    });

    onSave(processedRules);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-semibold">Rules Configuration</h2>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => append({ 
            ruleCode: catalog[0]?.ruleCode || '', 
            operator: catalog[0]?.supportedOperators[0] || '', 
            expectedValue: '', 
            failureOutcome: 'FAIL',
            reasonCode: '',
            customerMessage: '',
            internalMessage: '',
            isActive: true 
          })}
          className="flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" /> Add Rule
        </Button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="p-6">
        <div className="space-y-6">
          {fields.map((field, index) => {
            const currentCode = watchRules[index]?.ruleCode;
            const def = getRuleDef(currentCode);
            const isMandatory = def?.isMandatory;
            const canBeDisabled = def?.canBeDisabled;
            
            return (
              <div key={field.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50 flex gap-4">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Rule Code */}
                  <div className="col-span-1 lg:col-span-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Rule Condition {isMandatory && '*'}</label>
                    <select
                      {...register(`rules.${index}.ruleCode`, {
                        onChange: (e) => {
                          const newDef = catalog.find(c => c.ruleCode === e.target.value);
                          if (newDef) {
                            setValue(`rules.${index}.operator`, newDef.supportedOperators[0]);
                            setValue(`rules.${index}.expectedValue`, '');
                          }
                        }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      {catalog.map(c => (
                        <option key={c.ruleCode} value={c.ruleCode}>{c.ruleName}</option>
                      ))}
                    </select>
                  </div>

                  {/* Operator */}
                  <div className="col-span-1 lg:col-span-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Operator</label>
                    <select
                      {...register(`rules.${index}.operator`)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      {def?.supportedOperators.map(op => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </div>

                  {/* Expected Value */}
                  <div className="col-span-1 lg:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Expected Value {def?.valueType === 'STRING_ARRAY' && '(comma separated)'}</label>
                    {(!watchRules[index]?.operator?.startsWith('IS_')) ? (
                      <input
                        type="text"
                        {...register(`rules.${index}.expectedValue`)}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        placeholder="Expected Value..."
                      />
                    ) : (
                      <input
                        type="text"
                        disabled
                        value="N/A"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                      />
                    )}
                  </div>

                  {/* Failure Outcome */}
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Failure Outcome</label>
                    <select
                      {...register(`rules.${index}.failureOutcome`)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      <option value="FAIL">FAIL</option>
                    </select>
                  </div>

                  {/* Reason Code */}
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Reason Code</label>
                    <input
                      type="text"
                      {...register(`rules.${index}.reasonCode`)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="e.g. AGE_FAIL"
                    />
                    {errors.rules?.[index]?.reasonCode && <span className="text-red-500 text-xs">{errors.rules[index].reasonCode.message}</span>}
                  </div>

                  {/* Customer Message */}
                  <div className="col-span-1 lg:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Customer Message</label>
                    <input
                      type="text"
                      {...register(`rules.${index}.customerMessage`)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="Message shown to applicant"
                    />
                    {errors.rules?.[index]?.customerMessage && <span className="text-red-500 text-xs">{errors.rules[index].customerMessage.message}</span>}
                  </div>

                  {/* Active Toggle */}
                  <div className="col-span-1 flex flex-col pt-6">
                    <label className={`flex items-center gap-2 ${canBeDisabled === false ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        {...register(`rules.${index}.isActive`)}
                        className="w-4 h-4 text-blue-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={canBeDisabled === false}
                      />
                      <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                    {isMandatory && watchRules[index]?.isActive === false && (
                      <span className="text-xs text-amber-600 mt-1 flex items-start gap-1">
                        ⚠️ Mandatory rule is inactive
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex flex-col items-center justify-start pt-6 border-l border-gray-200 pl-4 ml-2">
                  {!isMandatory ? (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove Rule"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  ) : (
                    <div className="text-gray-300" title="Mandatory rules cannot be removed">
                      <TrashIcon className="w-5 h-5" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {fields.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No rules configured yet. Click "Add Rule" to begin.
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end">
          <Button type="submit" size="lg">Save Configuration</Button>
        </div>
      </form>
    </div>
  );
}
