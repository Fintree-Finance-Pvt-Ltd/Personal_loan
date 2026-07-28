import { z } from 'zod';
import { PlatformProductStatus } from '@prisma/client';

export const createPlatformProductSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
});

export const updatePlatformProductSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).optional(),
  status: z.nativeEnum(PlatformProductStatus).optional(),
});

export const platformProductQuerySchema = z.object({
  status: z.nativeEnum(PlatformProductStatus).optional(),
});
