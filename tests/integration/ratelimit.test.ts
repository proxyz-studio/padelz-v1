import { describe, expect, it } from 'vitest';
import { rateLimit } from '@/libs/RateLimit';

describe('rateLimit', () => {
  // SKIP: requires real Upstash credentials (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
  // Local .env.local uses stub/placeholder values that fail auth against the Upstash REST API.
  // Unskip once real secrets are configured in CI (GitHub Actions → repository secrets).
  it.skip('returns success for first request', async () => {
    const r = await rateLimit('test-key-' + Date.now(), 'score_submit');
    expect(r.success).toBe(true);
  });
});
