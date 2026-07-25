import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, Button, Card, Input, Spinner } from '../../../components/ui';
import {
  lenderFormSchema,
  toLenderPayload,
} from '../validation/lender.schema';

const EMPTY_VALUES = {
  legalName: '',
  displayName: '',
  code: '',
  supportEmail: '',
  supportPhone: '',
};

export function LenderForm({
  defaultValues = EMPTY_VALUES,
  submitLabel,
  busy,
  serverError,
  onSubmit,
  onCancel,
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(lenderFormSchema),
    defaultValues: EMPTY_VALUES,
    mode: 'onBlur',
  });

  useEffect(() => {
    reset({
      legalName: defaultValues.legalName ?? '',
      displayName: defaultValues.displayName ?? '',
      code: defaultValues.code ?? '',
      supportEmail: defaultValues.supportEmail ?? '',
      supportPhone: defaultValues.supportPhone ?? '',
    });
  }, [defaultValues, reset]);

  const submit = (values) => onSubmit(toLenderPayload(values));

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      {serverError && (
        <div className="mb-5">
          <Alert>{serverError}</Alert>
        </div>
      )}

      <Card>
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-ink">Lender identity</h2>
          <p className="mt-1 text-sm text-slate-500">
            Enter the lender&apos;s legal and platform-facing identity. The lender
            code must be unique.
          </p>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Input
            label="Legal name *"
            placeholder="Example: Fintree Finance Private Limited"
            autoComplete="organization"
            error={errors.legalName?.message}
            {...register('legalName')}
          />

          <Input
            label="Display name *"
            placeholder="Example: Fintree Finance"
            error={errors.displayName?.message}
            {...register('displayName')}
          />

          <Input
            label="Lender code *"
            placeholder="Example: FTF"
            maxLength={30}
            error={errors.code?.message}
            {...register('code', {
              onChange: (event) => {
                const normalized = event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9_-]/g, '');
                setValue('code', normalized, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              },
            })}
          />

          <div className="hidden md:block" />

          <Input
            label="Support email"
            type="email"
            placeholder="support@lender.com"
            autoComplete="email"
            error={errors.supportEmail?.message}
            {...register('supportEmail')}
          />

          <Input
            label="Support phone"
            type="tel"
            placeholder="+917977889246"
            autoComplete="tel"
            error={errors.supportPhone?.message}
            {...register('supportPhone')}
          />
        </div>
      </Card>

      <Card className="mt-5 bg-slate-50">
        <h2 className="font-bold text-ink">What happens next?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Saving creates or updates a Draft lender. A maker must submit the
          Draft, and a different checker must approve it before activation.
        </p>
      </Card>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>

        <Button type="submit" disabled={busy || (!isDirty && submitLabel !== 'Create lender')}>
          {busy ? <Spinner label="Saving" /> : submitLabel}
        </Button>
      </div>
    </form>
  );
}
