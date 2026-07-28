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
  requestedAmount: z.number().positive(),
  platformDecisionOutcome: z.string().optional(),
});

export const executeMlmAllocationSchema = z.object({
  applicationReference: z.string().min(1).max(100),
  requestedAmount: z.number().positive(),
  platformEvaluationReference: z.string().optional(),
  platformDecisionOutcome: z.string(),
  platformProductId: z.string().min(1),
});
