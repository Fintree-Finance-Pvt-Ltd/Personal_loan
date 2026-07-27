import { z } from 'zod';

export const decimalStringSchema = z.string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d{1,4})?$/, 'Must be a valid positive decimal or integer')
  .refine(val => Number(val) >= 0, 'Cannot be negative');

export const moneyStringSchema = z.string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, 'Must be a valid positive monetary amount with up to 2 decimal places')
  .refine(val => Number(val) >= 0, 'Cannot be negative');

export const offerTierSchema = z.object({
  completedLoansFrom: z.coerce.number().int().min(0, 'Must be at least 0'),
  completedLoansTo: z.preprocess(
    (v) => (v === '' || v === null || v === undefined) ? null : Number(v),
    z.number().int().min(0).nullable().optional()
  ),
  multiplier: decimalStringSchema,
  tierCap: z.union([moneyStringSchema, z.literal('')]).transform(v => (v === '' || v === undefined) ? null : v).nullable().optional(),
});

export const productStrategySchema = z.object({
  minimumAmount: moneyStringSchema,
  firstLoanBaseAmount: moneyStringSchema,
  maximumAmountCap: moneyStringSchema,
  repeatTierScope: z.enum(['SAME_LENDER', 'PLATFORM_WIDE']),
  roundingMethod: z.enum(['NONE', 'FLOOR', 'NEAREST', 'CEIL']),
  roundingUnit: z.union([moneyStringSchema, z.literal('')]).transform(v => (v === '' || v === undefined) ? null : v).nullable().optional(),
  effectiveFrom: z.union([z.string(), z.literal('')]).transform(v => (v === '' || v === undefined) ? null : v).nullable().optional(),
  tiers: z.array(offerTierSchema).min(1, 'At least one tier is required'),
});

export const createProductSchema = z.object({
  lenderId: z.string().min(1, 'Lender is required'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: z.string().trim().toUpperCase().min(1, 'Code is required').max(60),
  description: z.string().trim().max(255).optional(),
  strategy: productStrategySchema,
});

export const updateProductIdentitySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(255).optional(),
});
