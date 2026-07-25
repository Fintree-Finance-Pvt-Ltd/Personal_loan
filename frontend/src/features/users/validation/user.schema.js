import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Name must be at most 120 characters'),
  email: z.string().email('Enter a valid email address').max(254),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/\d/, 'Password must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),
  confirmPassword: z.string().min(1, 'Please confirm the password'),
  roleIds: z.array(z.string()).min(1, 'At least one role is required'),
}).refine(data => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match',
});

export const updateUserSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(120).optional(),
  email: z.string().email('Enter a valid email address').max(254).optional(),
}).refine(data => data.name !== undefined || data.email !== undefined, {
  message: 'Nothing to update',
});
