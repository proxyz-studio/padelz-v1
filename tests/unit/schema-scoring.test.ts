import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.CLERK_SECRET_KEY ??= 'sk_test_abc';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= 'pk_test_abc';
  process.env.CLERK_WEBHOOK_SECRET ??= 'whsec_abc';
  process.env.CRON_SECRET ??= 'a'.repeat(32);
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://x.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'abc';
  process.env.SENTRY_DSN ??= 'https://x@sentry.io/1';
});

describe('Scoring + leaderboard + notifications schema', () => {
  it('match_result_status_enum includes void (5 values)', async () => {
    const m = await import('@/models/Schema');
    expect(m.match_result_status_enum.enumValues).toEqual(['pending', 'confirmed', 'disputed', 'admin_set', 'void']);
  });
  it('notification_type_enum has all 7 v0.5 types', async () => {
    const m = await import('@/models/Schema');
    expect([...m.notification_type_enum.enumValues].sort()).toEqual([
      'pending_expired', 'registration_confirmed', 'score_confirmed',
      'score_disputed', 'score_overridden', 'score_pending', 'tier_promoted',
    ].sort());
  });
  it('leaderboard_period_enum has 3 periods', async () => {
    const m = await import('@/models/Schema');
    expect(m.leaderboard_period_enum.enumValues).toEqual(['week', 'month', 'season']);
  });
  it('exports match_results, points_ledger, leaderboard_snapshots, notifications', async () => {
    const m = await import('@/models/Schema');
    expect(m.match_results).toBeDefined();
    expect(m.points_ledger).toBeDefined();
    expect(m.leaderboard_snapshots).toBeDefined();
    expect(m.notifications).toBeDefined();
  });
});
