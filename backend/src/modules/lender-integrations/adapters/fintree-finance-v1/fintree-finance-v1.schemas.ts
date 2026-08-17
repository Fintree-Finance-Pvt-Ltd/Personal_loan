import { z } from 'zod';

export const FintreeErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
}).strict();

export const FintreeCreateResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: z.object({
      externalApplicationReference: z.string().min(1),
      lan: z.string().min(1),
      status: z.literal('CREATED'),
      partnerApplicationId: z.string().min(1),
      partnerApplicationNumber: z.string().min(1),
      createdAt: z.string().datetime({ offset: true }),
    }).strict(),
    correlationId: z.string().uuid(),
  }).strict(),
  z.object({
    success: z.literal(false),
    error: FintreeErrorSchema,
    correlationId: z.string().uuid(),
  }).strict(),
]);

export const FintreeConsentResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: z.object({
      status: z.literal('RECORDED'),
      consentReference: z.string().min(1),
      recordedAt: z.string().datetime({ offset: true }),
    }).strict(),
    correlationId: z.string().uuid(),
  }).strict(),
  z.object({
    success: z.literal(false),
    error: FintreeErrorSchema,
    correlationId: z.string().uuid(),
  }).strict(),
]);

export const FintreeDetailsResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: z.object({
      detailsVersion: z.number(),
      status: z.literal('DETAILS_ACCEPTED'),
      updatedAt: z.string().datetime({ offset: true }),
    }).strict(),
    correlationId: z.string().uuid(),
  }).strict(),
  z.object({
    success: z.literal(false),
    error: FintreeErrorSchema,
    correlationId: z.string().uuid(),
  }).strict(),
]);

export const FintreeDocumentResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: z.object({
      documentType: z.union([z.literal('AADHAAR_XML'), z.literal('AADHAAR_PDF')]),
      fileSha256: z.string().length(64).regex(/^[0-9a-fA-F]{64}$/),
      status: z.literal('RECEIVED'),
      partnerDocumentId: z.string().min(1),
      receivedAt: z.string().datetime({ offset: true }),
    }).strict(),
    correlationId: z.string().uuid(),
  }).strict(),
  z.object({
    success: z.literal(false),
    error: FintreeErrorSchema,
    correlationId: z.string().uuid(),
  }).strict(),
]);

// Confirmed against Fintree's real UAT response (2026-08-07): the pre-approval/BRE decision
// API uses the same {success,data,correlationId} envelope as every other Fintree endpoint.
export const FintreeDecisionResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: z.object({
      status: z.string().min(1),
      CREDIT_LIMIT_CHECK_RPM: z
        .object({
          derived_values: z.object({
            LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM: z.number(),
            LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM: z.number(),
          }),
        })
        .optional(),
    }).passthrough(),
    correlationId: z.string().uuid(),
  }).strict(),
  z.object({
    success: z.literal(false),
    error: FintreeErrorSchema,
    correlationId: z.string().uuid(),
  }).strict(),
]);

// The disburse-trigger call only acknowledges that Fintree has accepted the fund-trigger
// request — it is not the final disbursal confirmation. The actual UTR/status/date arrive
// later via the existing disbursal webhook (LoanService.processDisbursalWebhook).
export const FintreeDisburseResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: z.object({
      status: z.string().min(1),
      disbursalReference: z.string().optional(),
    }).passthrough(),
    correlationId: z.string().uuid(),
  }).strict(),
  z.object({
    success: z.literal(false),
    error: FintreeErrorSchema,
    correlationId: z.string().uuid(),
  }).strict(),
]);

// Servicing (post-disbursal) — confirmed against Fintree's real contract (2026-08-17):
// same {success,data,correlationId} / {success,error,correlationId} envelope as every
// other Fintree endpoint, error branch reusing the same FintreeErrorSchema (their
// `details` field only appears on some VALIDATION_ERROR responses, matching the
// already-optional `details` on FintreeErrorSchema below).
export const FintreeRepaymentResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: z.object({
      status: z.literal('REPAYMENT_RECORDED'),
    }).strict(),
    correlationId: z.string().uuid(),
  }).strict(),
  z.object({
    success: z.literal(false),
    error: FintreeErrorSchema,
    correlationId: z.string().uuid(),
  }).strict(),
]);

export const FintreeChargeResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: z.object({
      status: z.literal('CHARGE_ADDED'),
    }).strict(),
    correlationId: z.string().uuid(),
  }).strict(),
  z.object({
    success: z.literal(false),
    error: FintreeErrorSchema,
    correlationId: z.string().uuid(),
  }).strict(),
]);

export const FintreeChargeWaiverResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: z.object({
      status: z.literal('CHARGE_WAIVED'),
    }).strict(),
    correlationId: z.string().uuid(),
  }).strict(),
  z.object({
    success: z.literal(false),
    error: FintreeErrorSchema,
    correlationId: z.string().uuid(),
  }).strict(),
]);

export type FintreeCreateResponse = z.infer<typeof FintreeCreateResponseSchema>;
export type FintreeConsentResponse = z.infer<typeof FintreeConsentResponseSchema>;
export type FintreeDetailsResponse = z.infer<typeof FintreeDetailsResponseSchema>;
export type FintreeDocumentResponse = z.infer<typeof FintreeDocumentResponseSchema>;
export type FintreeDecisionResponse = z.infer<typeof FintreeDecisionResponseSchema>;
export type FintreeDisburseResponse = z.infer<typeof FintreeDisburseResponseSchema>;
export type FintreeRepaymentResponse = z.infer<typeof FintreeRepaymentResponseSchema>;
export type FintreeChargeResponse = z.infer<typeof FintreeChargeResponseSchema>;
export type FintreeChargeWaiverResponse = z.infer<typeof FintreeChargeWaiverResponseSchema>;

