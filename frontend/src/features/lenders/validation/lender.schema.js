import { z } from 'zod';

const optionalEmail = z
  .string()
  .trim()
  .max(254, 'Support email must not exceed 254 characters')
  .refine(
    (value) => value === '' || z.string().email().safeParse(value).success,
    'Enter a valid support email',
  );

const optionalPhone = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || /^\+?[0-9]{7,15}$/.test(value),
    'Phone must contain 7 to 15 digits and may start with +',
  );

export const lenderFormSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(2, 'Legal name must contain at least 2 characters')
    .max(255, 'Legal name must not exceed 255 characters'),

  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must contain at least 2 characters')
    .max(150, 'Display name must not exceed 150 characters'),

  code: z
    .string()
    .trim()
    .min(2, 'Lender code must contain at least 2 characters')
    .max(30, 'Lender code must not exceed 30 characters')
    .regex(
      /^[A-Z0-9_-]+$/,
      'Use uppercase letters, numbers, underscores or hyphens only',
    ),

  supportEmail: optionalEmail,
  supportPhone: optionalPhone,
});

export function toLenderPayload(values) {
  return {
    legalName: values.legalName.trim(),
    displayName: values.displayName.trim(),
    code: values.code.trim().toUpperCase(),
    supportEmail: values.supportEmail.trim() || null,
    supportPhone: values.supportPhone.trim() || null,
  };
}
