import { BadRequestException } from '@nestjs/common';
import {
  LenderApprovalStatus,
  LenderOperationalStatus,
} from '@prisma/client';
import { z } from 'zod';

const nullableEmail = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return typeof value === 'string'
      ? value.trim().toLowerCase()
      : value;
  },
  z.string().email('supportEmail must be a valid email').max(254).nullable().optional(),
);

const nullablePhone = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return typeof value === 'string' ? value.trim() : value;
  },
  z
    .string()
    .regex(/^\+?[0-9]{7,15}$/, 'supportPhone must contain 7 to 15 digits and may start with +')
    .nullable()
    .optional(),
);

const lenderCode = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : value,
  z
    .string()
    .min(2, 'code must contain at least 2 characters')
    .max(30, 'code must not exceed 30 characters')
    .regex(
      /^[A-Z0-9_-]+$/,
      'code can contain only uppercase letters, numbers, underscores and hyphens',
    ),
);

const createLenderSchema = z
  .object({
    legalName: z
      .string()
      .trim()
      .min(2, 'legalName must contain at least 2 characters')
      .max(255, 'legalName must not exceed 255 characters'),
    displayName: z
      .string()
      .trim()
      .min(2, 'displayName must contain at least 2 characters')
      .max(150, 'displayName must not exceed 150 characters'),
    code: lenderCode,
    supportEmail: nullableEmail,
    supportPhone: nullablePhone,
  })
  .strict();

const updateLenderSchema = z
  .object({
    legalName: z
      .string()
      .trim()
      .min(2, 'legalName must contain at least 2 characters')
      .max(255, 'legalName must not exceed 255 characters')
      .optional(),
    displayName: z
      .string()
      .trim()
      .min(2, 'displayName must contain at least 2 characters')
      .max(150, 'displayName must not exceed 150 characters')
      .optional(),
    code: lenderCode.optional(),
    supportEmail: nullableEmail,
    supportPhone: nullablePhone,
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    'At least one lender field must be provided',
  );

const rejectLenderSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, 'reason must contain at least 5 characters')
      .max(500, 'reason must not exceed 500 characters'),
  })
  .strict();

const listLendersSchema = z
  .object({
    search: z.preprocess(
      (value) => {
        if (value === undefined || value === null || value === '') {
          return undefined;
        }
        return typeof value === 'string' ? value.trim() : value;
      },
      z.string().max(100, 'search must not exceed 100 characters').optional(),
    ),
    approvalStatus: z.nativeEnum(LenderApprovalStatus).optional(),
    operationalStatus: z.nativeEnum(LenderOperationalStatus).optional(),
    page: z.preprocess(
      (value) =>
        value === undefined || value === null || value === ''
          ? 1
          : Number(value),
      z.number().int().min(1, 'page must be at least 1'),
    ),
    limit: z.preprocess(
      (value) =>
        value === undefined || value === null || value === ''
          ? 9
          : Number(value),
      z.number().int().min(1).max(100, 'limit must not exceed 100'),
    ),
  })
  .strict();

const lenderIdSchema = z
  .string()
  .trim()
  .cuid('Invalid lender ID');

export type CreateLenderInput = z.infer<typeof createLenderSchema>;
export type UpdateLenderInput = z.infer<typeof updateLenderSchema>;
export type RejectLenderInput = z.infer<typeof rejectLenderSchema>;
export type ListLendersInput = z.infer<typeof listLendersSchema>;

function parse<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
): z.infer<S> {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const message = result.error.issues
    .map((issue) => {
      const field = issue.path.join('.');
      return field ? `${field}: ${issue.message}` : issue.message;
    })
    .join('; ');

  throw new BadRequestException({
    error: {
      code: 'VALIDATION_ERROR',
      message,
    },
  });
}

export function parseCreateLenderBody(body: unknown): CreateLenderInput {
  return parse(createLenderSchema, body);
}

export function parseUpdateLenderBody(body: unknown): UpdateLenderInput {
  return parse(updateLenderSchema, body);
}

export function parseRejectLenderBody(body: unknown): RejectLenderInput {
  return parse(rejectLenderSchema, body);
}

export function parseLenderListQuery(query: unknown): ListLendersInput {
  return parse(listLendersSchema, query);
}

export function parseLenderId(id: unknown): string {
  return parse(lenderIdSchema, id);
}
