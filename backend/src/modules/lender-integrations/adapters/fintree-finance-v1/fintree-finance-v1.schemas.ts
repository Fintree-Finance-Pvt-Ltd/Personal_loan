import { z } from 'zod';

export const FintreeCreateResponseSchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'REJECTED']),
  partnerApplicationId: z.string().optional(),
  partnerReference: z.string().optional(),
  error: z.string().optional(),
});

export const FintreeConsentResponseSchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'FAILED']),
  consentReference: z.string().optional(),
  error: z.string().optional(),
});

export const FintreeProfileResponseSchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'FAILED']),
  error: z.string().optional(),
});

export const FintreePreApprovalResponseSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'PENDING', 'FAILED']),
  decisionReference: z.string().optional(),
  approvedAmount: z.number().optional().nullable(),
  approvedTenure: z.number().optional().nullable(),
  approvedRoi: z.number().optional().nullable(),
  rejectionReason: z.string().optional(),
  error: z.string().optional(),
});

export const FintreeStatusResponseSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'PENDING', 'FAILED']),
  decisionReference: z.string().optional(),
  approvedAmount: z.number().optional().nullable(),
  approvedTenure: z.number().optional().nullable(),
  approvedRoi: z.number().optional().nullable(),
  rejectionReason: z.string().optional(),
  error: z.string().optional(),
  applicationStage: z.string().optional(),
});
