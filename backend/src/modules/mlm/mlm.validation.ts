import { z } from 'zod';
import {
  MlmPolicyOperationalStatus,
  MlmAllocationMethod,
} from '@prisma/client';

export const createMlmPolicySchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  scopeCode: z.string().max(60).optional(),
  platformProductId: z.string().min(1),
});

export const updateMlmPolicySchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).optional(),
  operationalStatus: z.nativeEnum(MlmPolicyOperationalStatus).optional(),
});

export const createMlmPolicyVersionSchema = z.object({
  allocationMethod: z.nativeEnum(MlmAllocationMethod),
  effectiveFrom: z.string().datetime().optional(),
});

export const mlmRouteSchema = z.object({
  lenderId: z.string().min(1),
  productId: z.string().min(1),
  allocationPercentage: z.union([z.number(), z.string()]), // e.g. 60.0000 or "60.0000"
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0),
});

export const updateMlmAllocationRoutesSchema = z.object({
  routes: z.array(mlmRouteSchema).min(1),
});

export const rejectMlmPolicyVersionSchema = z.object({
  rejectionReason: z.string().min(1).max(500),
});

export const simulateMlmPolicyVersionSchema = z.object({
  requestedAmount: z.union([z.number(), z.string()]).transform(Number).refine(val => val > 0, 'Must be positive').refine(val => /^\d+(\.\d{1,2})?$/.test(val.toString()), 'Maximum two decimal places'),
  previewCount: z.number().int().min(1).max(100).default(20),
  startFromZero: z.boolean().default(false),
});

export const mlmDistributionQuerySchema = z.object({
  platformProductId: z.string().optional(),
  policyId: z.string().optional(),
  versionId: z.string().optional(),
  lenderId: z.string().optional(),
  readiness: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).refine(data => data.platformProductId || data.policyId || data.versionId, {
  message: "platformProductId is required unless policyId or versionId uniquely resolves it.",
  path: ["platformProductId"]
});

export const executeMlmAllocationSchema = z.object({
  applicationReference: z.string().min(1).max(100),
  requestedAmount: z.number().positive(),
  platformEvaluationReference: z.string().optional(),
  platformDecisionOutcome: z.string(),
  platformProductId: z.string().min(1),
});
