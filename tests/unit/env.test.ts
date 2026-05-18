import { describe, expect, it } from 'vitest';

describe('Env validation', () => {
  it('rejects build when DATABASE_URL is missing', async () => {
    const orig = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    await expect(async () => {
      // Use fresh import so the validator runs again with current env
      const mod = await import('@/libs/Env?fresh=' + Date.now());
      void mod.Env;
    }).rejects.toThrow();
    process.env.DATABASE_URL = orig;
  });

  it('accepts valid env vars', async () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
    process.env.CLERK_SECRET_KEY = 'sk_test_abc';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_abc';
    process.env.CLERK_WEBHOOK_SECRET = 'whsec_abc';
    process.env.CRON_SECRET = 'a'.repeat(32);
    process.env.UPSTASH_REDIS_REST_URL = 'https://x.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'abc';
    process.env.SENTRY_DSN = 'https://x@sentry.io/1';
    const mod = await import('@/libs/Env');
    expect(mod.Env).toBeDefined();
  });
});
