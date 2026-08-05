import { resolve } from 'node:path';
import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).default('false').transform((value) => value === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_PREFIX: z.string().regex(/^[a-z][a-z0-9-]*$/).default('api'),
    DATABASE_URL: z.string().startsWith('mysql://'),
    FRONTEND_URL: z.string().url().refine((value) => !value.includes('*'), 'Wildcards are forbidden'),
    TRUST_PROXY: booleanString,
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().regex(/^\d+(s|m|h)$/).default('10m'),
    JWT_ISSUER: z.string().min(3).max(100),
    JWT_AUDIENCE: z.string().min(3).max(100),
    CUSTOMER_JWT_ACCESS_SECRET: z.string().min(32).optional(),
    CUSTOMER_JWT_ACCESS_EXPIRES_IN: z.string().regex(/^\d+(s|m|h)$/).default('15m'),
    REFRESH_TOKEN_PEPPER: z.string().min(32),
    REFRESH_SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(8),
    REFRESH_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
    COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/),
    CUSTOMER_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('plp_customer_refresh'),
    COOKIE_SECURE: booleanString,
    COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),
    ARGON2_MEMORY_COST: z.coerce.number().int().min(19456).max(1048576).default(65536),
    ARGON2_TIME_COST: z.coerce.number().int().min(2).max(10).default(3),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(8).default(1),
    SECURITY_HMAC_KEY: z.string().min(32),
    AUDIT_INTEGRITY_KEY: z.string().min(32),
    SEED_SUPERADMIN_NAME: z.string().optional().default(''),
    SEED_SUPERADMIN_EMAIL: z.string().optional().default(''),
    SEED_SUPERADMIN_PASSWORD: z.string().optional().default(''),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    REQUEST_BODY_LIMIT: z.string().regex(/^\d+(kb|mb)$/i).default('100kb'),
    ELECTRONIC_SIGN_ALLOW_LOOPBACK_IP: booleanString.default('true'),
    ELECTRONIC_SIGN_REQUIRE_PUBLIC_IP: booleanString.default('false'),
    ELECTRONIC_SIGN_SHOW_ENVIRONMENT_LABEL: booleanString.default('true'),
    ELECTRONIC_SIGN_TIMEZONE: z.string().default('Asia/Kolkata'),
    PL_WEBHOOK_SECRET: z.string().min(16).optional(),
    LENDER_INTEGRATION_WORKER_ENABLED: booleanString.default('true'),
    LENDER_INTEGRATION_WORKER_POLL_MS: z.coerce.number().int().min(1000).max(60000).default(5000),
    LENDER_INTEGRATION_WORKER_LOCK_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    LENDER_DATA_SHARING_CONSENT_VERSION: z.string().min(1).max(50).default('1.0'),
    LENDER_DATA_SHARING_CONSENT_REFERENCE: z.string().min(1).max(150).default('CUSTOMER_LENDER_DATA_SHARING'),
    LENDER_INTEGRATION_ALLOWED_HOSTS: z.string().optional().default(''),
    FINTREE_API_KEY: z.string().optional().default(''),
  })
  .superRefine((env, context) => {
    if (env.COOKIE_SAME_SITE === 'none' && !env.COOKIE_SECURE) {
      context.addIssue({ code: 'custom', path: ['COOKIE_SAME_SITE'], message: 'requires COOKIE_SECURE=true' });
    }
    if (env.NODE_ENV !== 'production') return;
    const weakMarkers = ['development', 'replace', 'example', 'changeme', 'password'];
    for (const key of ['JWT_ACCESS_SECRET', 'REFRESH_TOKEN_PEPPER', 'SECURITY_HMAC_KEY', 'AUDIT_INTEGRITY_KEY'] as const) {
      const value = env[key];
      if (value.length < 48 || weakMarkers.some((marker) => value.toLowerCase().includes(marker))) {
        context.addIssue({ code: 'custom', path: [key], message: 'must be a strong production secret' });
      }
    }
    if (!env.COOKIE_SECURE) {
      context.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'must be true in production' });
    }
    if (!env.FRONTEND_URL.startsWith('https://')) {
      context.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'must use HTTPS in production' });
    }
    const seedValues = [env.SEED_SUPERADMIN_EMAIL, env.SEED_SUPERADMIN_PASSWORD];
    if (seedValues.some((value) => weakMarkers.some((marker) => value.toLowerCase().includes(marker)))) {
      context.addIssue({
        code: 'custom',
        path: ['SEED_SUPERADMIN_PASSWORD'],
        message: 'placeholder seed credentials are forbidden in production',
      });
    }
  });

export type Environment = z.infer<typeof schema>;

export const backendEnvPath = (): string => {
  const cwd = process.cwd();
  return resolve(cwd.endsWith('backend') ? cwd : resolve(cwd, 'backend'), '.env');
};

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid backend environment configuration: ${fields}`);
  }
  return result.data;
}
