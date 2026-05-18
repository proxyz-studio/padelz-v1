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

describe('Tournament schema', () => {
  it('exports tournament_format_enum with 4 formats', async () => {
    const m = await import('@/models/Schema');
    expect(m.tournament_format_enum.enumValues).toEqual(['americano', 'mexicano', 'round_robin', 'bracket']);
  });
  it('exports tournament_type_enum with 4 types', async () => {
    const m = await import('@/models/Schema');
    expect(m.tournament_type_enum.enumValues).toEqual(['open', 'club_internal', 'group', 'casual']);
  });
  it('match_status_enum includes void', async () => {
    const m = await import('@/models/Schema');
    expect(m.match_status_enum.enumValues).toContain('void');
  });
  it('exports tournaments, registrations, brackets, matches', async () => {
    const m = await import('@/models/Schema');
    expect(m.tournaments).toBeDefined();
    expect(m.registrations).toBeDefined();
    expect(m.brackets).toBeDefined();
    expect(m.matches).toBeDefined();
  });
});
