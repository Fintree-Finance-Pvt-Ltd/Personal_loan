import { z } from 'zod';
import { UserStatus } from '@prisma/client';

export const userQuerySchema = z.object({
  search: z.string().max(100).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  roleCode: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  email: z.string().max(254).email('Enter a valid email address').transform(val => val.toLowerCase().trim()),
  password: z.string().min(12, 'Password must be at least 12 characters').max(128),
  roleIds: z.array(z.string()).min(1, 'At least one role is required'),
  status: z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
}).strict();

export const updateUserSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(120).optional(),
  email: z.string().max(254).email('Enter a valid email address').transform(val => val.toLowerCase().trim()).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'Update payload cannot be empty',
});

export const replaceUserRolesSchema = z.object({
  roleIds: z.array(z.string()).min(1, 'At least one role is required'),
}).strict();

export const userIdSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

export type UserQuery = z.infer<typeof userQuerySchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type ReplaceUserRolesDto = z.infer<typeof replaceUserRolesSchema>;
