import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { config } from 'dotenv';

// Load .env.local so Env validation (t3-oss/env-nextjs) passes at test startup.
config({ path: path.resolve(__dirname, '.env.local') });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
