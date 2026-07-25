import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  code: z
    .string()
    .min(1, 'Code is required')
    .max(80, 'Code must be at most 80 characters')
    .regex(/^[A-Z0-9_]+$/, 'Code must contain only uppercase letters, numbers, and underscores'),
  description: z.string().max(255, 'Description must be at most 255 characters').optional(),
  permissionIds: z.array(z.string()).default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(100, 'Name must be at most 100 characters').optional(),
  description: z.string().max(255, 'Description must be at most 255 characters').optional(),
});
