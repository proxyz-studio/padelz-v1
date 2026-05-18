import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const Env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    CLERK_SECRET_KEY: z.string().startsWith('sk_'),
    CLERK_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
    CRON_SECRET: z.string().min(32),
    UPSTASH_REDIS_REST_URL: z.string().url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    SENTRY_DSN: z.string().url(),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    PLATFORM_ADMIN_EMAILS: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
