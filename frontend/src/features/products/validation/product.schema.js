import { z } from 'zod';

export const decimalStringSchema = z.string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d{1,4})?$/, 'Must be a valid positive decimal or integer')
  .refine(val => Number(val) >= 0, 'Cannot be negative');

export const moneyStringSchema = z.string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, 'Must be a valid positive monetary amount with up to 2 decimal places')
  .refine(val => Number(val) >= 0, 'Cannot be negative');

export const percentStringSchema = z.string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d{1,4})?$/, 'Must be a valid percentage')
  .refine(val => Number(val) >= 0 && Number(val) <= 1000, 'Must be between 0 and 1000');

export const multiplierSchema = z.object({
  minimumCompletedLoans: z.coerce.number().int().min(0, 'Must be at least 0'),
  multiplier: decimalStringSchema,
});

export const productStrategySchema = z.object({
  minimumAmount: moneyStringSchema,
  firstLoanBaseAmount: moneyStringSchema,
  maximumAmountCap: moneyStringSchema,
  repeatTierScope: z.enum(['SAME_LENDER', 'PLATFORM_WIDE']),
  roundingMethod: z.enum(['NONE', 'FLOOR', 'NEAREST', 'CEIL']),
  roundingUnit: z.union([moneyStringSchema, z.literal('')]).transform(v => (v === '' || v === undefined) ? null : v).nullable().optional(),
  effectiveFrom: z.union([z.string(), z.literal('')]).transform(v => (v === '' || v === undefined) ? null : v).nullable().optional(),
  
  interestMethod: z.enum(['REDUCING_BALANCE', 'FLAT_RATE']),
  annualRoiPercent: percentStringSchema,
  processingFeePercent: percentStringSchema,
  processingFeeGstPercent: percentStringSchema,
  assessmentFeeAmount: moneyStringSchema,
  assessmentFeeGstPercent: percentStringSchema,
  penalChargeAmount: moneyStringSchema,
  bounceChargeAmount: moneyStringSchema,
  emiDueDay: z.coerce.number().int().min(1).max(31),
  includeAssessmentFeeInApr: z.boolean().default(false),
  
  multipliers: z.array(multiplierSchema).min(1, 'At least one multiplier is required'),
  tenureType: z.enum(['MONTHS', 'DAYS']).default('MONTHS'),
  tenures: z.union([
    z.string().transform(v => v.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))),
    z.array(z.number())
  ]).refine(arr => arr.length > 0, 'At least one tenure is required'),
});

export const createProductSchema = z.object({
  lenderId: z.string().min(1, 'Lender is required'),
  platformProductId: z.string().min(1, 'Platform Product is required'),
  name: z.string().trim().max(120).optional(),
  code: z.string().trim().toUpperCase().max(60).optional(),
  description: z.string().trim().max(255).optional(),
  strategy: productStrategySchema,
});

export const updateProductIdentitySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(255).optional(),
});

export const updateProductStrategySchema = productStrategySchema.extend({
  expectedVersion: z.number().int().min(1),
});
