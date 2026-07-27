import { z } from 'zod';
import { PolicyRuleCategory, PolicyRuleValueType, PolicyRuleOperator, PolicyDecisionOutcome } from '@prisma/client';

export const createPlatformPolicySchema = z.object({
  name: z.string().min(3).max(150),
  code: z.string().min(3).max(60).regex(/^[A-Z0-9_]+$/),
  description: z.string().max(500).optional(),
}).strict();

export const updatePlatformPolicySchema = z.object({
  name: z.string().min(3).max(150).optional(),
  description: z.string().max(500).optional(),
}).strict();

export const rulePayloadSchema = z.object({
  ruleCode: z.string(),
  // Derived fields from catalog (ignored or used for cross-check)
  // We will force them from catalog in the backend.
  operator: z.nativeEnum(PolicyRuleOperator),
  expectedValue: z.any().nullable().optional(),
  failureOutcome: z.literal(PolicyDecisionOutcome.FAIL),
  reasonCode: z.string().min(1).max(100),
  customerMessage: z.string().min(1).max(300),
  internalMessage: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
}).strict();

export const updatePolicyRulesSchema = z.object({
  expectedVersion: z.number().int().positive(),
  rules: z.array(rulePayloadSchema),
}).strict();

export const rejectPolicyVersionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  rejectionReason: z.string().min(5).max(500),
}).strict();

export const lifecycleActionSchema = z.object({
  expectedVersion: z.number().int().positive(),
}).strict();

export const activatePolicyVersionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  effectiveFrom: z.string().datetime().optional().nullable(),
}).strict();

export const simulatePolicySchema = z.object({
  evaluationDate: z.string().datetime().optional(),
  inputs: z.record(z.any()),
}).strict();
