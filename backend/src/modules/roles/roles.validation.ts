import { z } from 'zod';
import { RoleStatus } from '@prisma/client';

export const roleQuerySchema = z.object({
  search: z.string().max(100).optional(),
  status: z.nativeEnum(RoleStatus).optional(),
  isSystem: z
    .string()
    .optional()
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    }),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createRoleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  code: z
    .string()
    .min(1, 'Code is required')
    .max(80)
    .regex(/^[A-Z0-9_]+$/, 'Code must contain only uppercase letters, numbers, and underscores')
    .transform((val) => val.toUpperCase()),
  description: z.string().max(255).optional(),
  status: z.nativeEnum(RoleStatus).default(RoleStatus.ACTIVE),
  permissionIds: z.array(z.string()).default([]),
}).strict();

export const updateRoleSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(100).optional(),
  description: z.string().max(255).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'Update payload cannot be empty',
});

export const replaceRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string()),
}).strict();

export const roleIdSchema = z.object({
  roleId: z.string().min(1, 'Role ID is required'),
});

export type RoleQuery = z.infer<typeof roleQuerySchema>;
export type CreateRoleDto = z.infer<typeof createRoleSchema>;
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;
export type ReplaceRolePermissionsDto = z.infer<typeof replaceRolePermissionsSchema>;
