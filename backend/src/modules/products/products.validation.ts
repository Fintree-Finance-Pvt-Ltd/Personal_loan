import { z } from 'zod';
import { ProductOperationalStatus, ProductVersionStatus, RepeatTierScope, AmountRoundingMethod, InterestCalculationMethod, TenureType } from '@prisma/client';

export const decimalStringSchema = z.string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d{1,4})?$/, 'Must be a valid positive decimal or integer')
  .refine(val => Number(val) >= 0, 'Cannot be negative');

export const moneyStringSchema = z.string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, 'Must be a valid positive monetary amount with up to 2 decimal places')
  .refine(val => Number(val) >= 0, 'Cannot be negative');

const offerMultiplierSchema = z.object({
  minimumCompletedLoans: z.number().int().min(0),
  multiplier: decimalStringSchema.refine(val => Number(val) > 0, 'Multiplier must be greater than 0'),
}).strict();

export const createProductStrategySchema = z.object({
  minimumAmount: moneyStringSchema,
  firstLoanBaseAmount: moneyStringSchema,
  maximumAmountCap: moneyStringSchema,
  repeatTierScope: z.nativeEnum(RepeatTierScope),
  roundingMethod: z.nativeEnum(AmountRoundingMethod),
  roundingUnit: moneyStringSchema.nullable().optional().transform(v => v || null),
  interestMethod: z.nativeEnum(InterestCalculationMethod),
  annualRoiPercent: decimalStringSchema,
  processingFeePercent: decimalStringSchema,
  processingFeeGstPercent: decimalStringSchema,
  assessmentFeeAmount: moneyStringSchema,
  assessmentFeeGstPercent: decimalStringSchema,
  penalChargeAmount: moneyStringSchema,
  bounceChargeAmount: moneyStringSchema,
  emiDueDay: z.number().int().min(1).max(28),
  includeAssessmentFeeInApr: z.boolean().default(false),
  effectiveFrom: z.string().datetime().nullable().optional().transform(v => v || null),
  tenureType: z.nativeEnum(TenureType).default('MONTHS'),
  tenures: z.array(z.number().int().min(1)).min(1, 'At least one tenure is required'),
  multipliers: z.array(offerMultiplierSchema)
    .min(1, 'At least one multiplier is required')
    .refine(tiers => {
      if (tiers.length === 0) return true;
      const first = tiers[0];
      return first.minimumCompletedLoans === 0 && Number(first.multiplier) === 1;
    }, 'The first multiplier must be for 0 completed loans with a multiplier of exactly 1.0000')
    .refine(tiers => {
      const thresholds = tiers.map(t => t.minimumCompletedLoans);
      return new Set(thresholds).size === thresholds.length;
    }, 'Minimum completed loans thresholds must be unique'),
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

export const updateProductStatusSchema = z.object({
  operationalStatus: z.nativeEnum(ProductOperationalStatus),
}).strict();

export const updateProductStrategySchema = createProductStrategySchema.extend({
  expectedVersion: z.number().int().min(1),
}).strict();

export const rejectProductVersionSchema = z.object({
  reason: z.string().trim().min(1, 'Rejection reason is required').max(500),
}).strict();

export const simulateProductAmountSchema = z.object({
  completedLoans: z.number().int().min(0),
  tenure: z.number().int().min(1),
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
