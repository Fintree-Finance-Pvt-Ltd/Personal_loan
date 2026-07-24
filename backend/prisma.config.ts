import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

const cwd = process.cwd();
const backendRoot = cwd.endsWith('backend') ? cwd : resolve(cwd, 'backend');
process.loadEnvFile(resolve(backendRoot, '.env'));

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
