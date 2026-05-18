import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // Reuse the same env-stub pattern from tests/unit/db.test.ts
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.CLERK_SECRET_KEY ??= 'sk_test_abc';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= 'pk_test_abc';
  process.env.CLERK_WEBHOOK_SECRET ??= 'whsec_abc';
  process.env.CRON_SECRET ??= 'a'.repeat(32);
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://x.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'abc';
  process.env.SENTRY_DSN ??= 'https://x@sentry.io/1';
});

describe('Identity schema', () => {
  it('exports tier_enum with 5 tiers', async () => {
    const { tier_enum } = await import('@/models/Schema');
    expect(tier_enum.enumValues).toEqual(['bronze', 'silver', 'gold', 'platinum', 'diamond']);
  });

  it('exports users, players, clubs, club_memberships, tier_history', async () => {
    const m = await import('@/models/Schema');
    expect(m.users).toBeDefined();
    expect(m.players).toBeDefined();
    expect(m.clubs).toBeDefined();
    expect(m.club_memberships).toBeDefined();
    expect(m.tier_history).toBeDefined();
  });

  it('membership_role_enum has admin and member', async () => {
    const { membership_role_enum } = await import('@/models/Schema');
    expect(membership_role_enum.enumValues).toEqual(['admin', 'member']);
  });

  it('tier_change_reason_enum has 4 values', async () => {
    const { tier_change_reason_enum } = await import('@/models/Schema');
    expect(tier_change_reason_enum.enumValues).toEqual(['initial', 'auto_promote', 'auto_demote', 'manual']);
  });
});
