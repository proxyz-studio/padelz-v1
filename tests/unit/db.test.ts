import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
  process.env.CLERK_SECRET_KEY = 'sk_test_abc';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_abc';
  process.env.CLERK_WEBHOOK_SECRET = 'whsec_abc';
  process.env.CRON_SECRET = 'a'.repeat(32);
  process.env.UPSTASH_REDIS_REST_URL = 'https://x.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'abc';
  process.env.SENTRY_DSN = 'https://x@sentry.io/1';
});

describe('DB module', () => {
  it('exports a db client', async () => {
    const { db } = await import('@/libs/DB');
    expect(db).toBeDefined();
    expect(typeof db.execute).toBe('function');
  });
});
