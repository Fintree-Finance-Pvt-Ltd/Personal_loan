import { z } from 'zod';

export const createPlatformPolicySchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters").max(150, "Name is too long"),
  code: z.string().min(3, "Code must be at least 3 characters").max(60).regex(/^[A-Z0-9_]+$/, "Only uppercase letters, numbers and underscores allowed"),
  description: z.string().max(500, "Description is too long").optional(),
});

export const ruleEditorSchema = z.object({
  rules: z.array(z.object({
    ruleCode: z.string(),
    operator: z.string(),
    expectedValue: z.any().optional().nullable(),
    failureOutcome: z.literal('FAIL').default('FAIL'),
    reasonCode: z.string().min(1, "Reason code is required"),
    customerMessage: z.string().min(1, "Customer message is required"),
    internalMessage: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
  }))
});

export const rejectVersionSchema = z.object({
  rejectionReason: z.string().min(5, "Reason must be at least 5 characters").max(500, "Reason is too long"),
});
