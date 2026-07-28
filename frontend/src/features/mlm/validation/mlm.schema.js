import { z } from 'zod';

export const createMlmPolicySchema = z.object({
  name: z.string().min(1, 'Name is required').max(150, 'Max 150 characters'),
  code: z.string().min(1, 'Code is required').max(60, 'Max 60 characters'),
  description: z.string().max(500, 'Max 500 characters').optional(),
});

export const createMlmPolicyVersionSchema = z.object({
  allocationMethod: z.enum(['PRIORITY_FALLBACK', 'WEIGHTED_FAIR_SHARE']),
  distributionBasis: z.enum(['APPLICATION_COUNT', 'ALLOCATED_AMOUNT']).optional(),
  effectiveFrom: z.string().optional(),
});

export const mlmRouteSchema = z.object({
  lenderId: z.string().min(1, 'Lender is required'),
  productId: z.string().min(1, 'Product is required'),
  customerSegment: z.enum(['ALL', 'NEW', 'REPEAT']),
  allocationWeightPercent: z.number().min(0, 'Min 0').max(100, 'Max 100').optional(),
  priority: z.number().int().min(1, 'Min priority is 1'),
  minimumTicketAmount: z.number().min(0, 'Must be positive').optional(),
  maximumTicketAmount: z.number().min(0, 'Must be positive').optional(),
  capacityPeriod: z.enum(['DAILY', 'MONTHLY']),
  maximumApplicationCount: z.number().int().min(1, 'Must be positive').optional(),
  maximumAllocatedAmount: z.number().min(0, 'Must be positive').optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateMlmAllocationRoutesSchema = z.object({
  routes: z.array(mlmRouteSchema).min(1, 'At least one route is required'),
});

export const rejectMlmPolicyVersionSchema = z.object({
  rejectionReason: z.string().min(1, 'Reason is required').max(500, 'Max 500 characters'),
});

export const simulateMlmPolicyVersionSchema = z.object({
  requestedAmount: z.number().min(1, 'Requested amount must be at least 1'),
  customerSegment: z.enum(['ALL', 'NEW', 'REPEAT']),
});
