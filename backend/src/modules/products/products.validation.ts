import { z } from 'zod';
import { ProductOperationalStatus, ProductVersionStatus, RepeatTierScope, AmountRoundingMethod } from '@prisma/client';

export const decimalStringSchema = z.string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d{1,4})?$/, 'Must be a valid positive decimal or integer')
  .refine(val => Number(val) >= 0, 'Cannot be negative');

export const moneyStringSchema = z.string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, 'Must be a valid positive monetary amount with up to 2 decimal places')
  .refine(val => Number(val) >= 0, 'Cannot be negative');

const offerTierSchema = z.object({
  completedLoansFrom: z.number().int().min(0),
  completedLoansTo: z.number().int().min(0).nullable(),
  multiplier: decimalStringSchema,
  tierCap: moneyStringSchema.nullable().optional().transform(v => v || null),
}).strict();

export const createProductStrategySchema = z.object({
  minimumAmount: moneyStringSchema,
  firstLoanBaseAmount: moneyStringSchema,
  maximumAmountCap: moneyStringSchema,
  repeatTierScope: z.nativeEnum(RepeatTierScope),
  roundingMethod: z.nativeEnum(AmountRoundingMethod),
  roundingUnit: moneyStringSchema.nullable().optional().transform(v => v || null),
  effectiveFrom: z.string().datetime().nullable().optional().transform(v => v || null),
  tiers: z.array(offerTierSchema).min(1, 'At least one tier is required'),
}).strict();

export const createProductSchema = z.object({
  lenderId: z.string().min(1, 'Lender ID is required'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: z.string().trim().toUpperCase().min(1, 'Code is required').max(60),
  description: z.string().trim().max(255).optional().transform(v => v || null),
  strategy: createProductStrategySchema,
}).strict();

export const updateProductIdentitySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(255).nullable().optional(),
}).strict();

export const updateProductVersionSchema = z.object({
  expectedVersion: z.number().int().min(1),
  minimumAmount: moneyStringSchema.optional(),
  firstLoanBaseAmount: moneyStringSchema.optional(),
  maximumAmountCap: moneyStringSchema.optional(),
  repeatTierScope: z.nativeEnum(RepeatTierScope).optional(),
  roundingMethod: z.nativeEnum(AmountRoundingMethod).optional(),
  roundingUnit: moneyStringSchema.nullable().optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
}).strict();

export const replaceOfferTiersSchema = z.object({
  expectedVersion: z.number().int().min(1),
  tiers: z.array(offerTierSchema).min(1, 'At least one tier is required'),
}).strict();

export const rejectProductVersionSchema = z.object({
  reason: z.string().trim().min(1, 'Rejection reason is required').max(500),
}).strict();

export const simulateProductAmountSchema = z.object({
  completedLoans: z.number().int().min(0),
  lenderApprovedAmount: moneyStringSchema.optional(),
}).strict();

export const productQuerySchema = z.object({
  search: z.string().trim().optional(),
  lenderId: z.string().optional(),
  operationalStatus: z.nativeEnum(ProductOperationalStatus).optional(),
  versionStatus: z.nativeEnum(ProductVersionStatus).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});
