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

// Fintree's real pre-approval/BRE decision API does not use the {success,data,correlationId}
// envelope the other (internally mocked) endpoints use above. It responds flat, e.g.:
// { status: "Approved", CREDIT_LIMIT_CHECK_RPM: { derived_values: { LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM: 8000, LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM: 0 } } }
export const FintreeDecisionResponseSchema = z.object({
  status: z.string().min(1),
  CREDIT_LIMIT_CHECK_RPM: z
    .object({
      derived_values: z.object({
        LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM: z.number(),
        LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM: z.number(),
      }),
    })
    .optional(),
}).passthrough();

export type FintreeCreateResponse = z.infer<typeof FintreeCreateResponseSchema>;
export type FintreeConsentResponse = z.infer<typeof FintreeConsentResponseSchema>;
export type FintreeDetailsResponse = z.infer<typeof FintreeDetailsResponseSchema>;
export type FintreeDocumentResponse = z.infer<typeof FintreeDocumentResponseSchema>;
export type FintreeDecisionResponse = z.infer<typeof FintreeDecisionResponseSchema>;

