import { describe, expect, it, expectTypeOf } from 'vitest';
import type { Tier } from '@/features/profiles/types';
import type { MatchForScoring } from '@/features/tournaments/types';
import type { MatchInput, PointsAward, Result } from '@/features/scoring/types';
import type { LeaderboardRow } from '@/features/leaderboard/types';
import type { NotificationType } from '@/features/notifications/types';

describe('Cross-module contracts', () => {
  it('Tier is the bronze→diamond enum', () => {
    expectTypeOf<Tier>().toEqualTypeOf<'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'>();
  });
  it('MatchForScoring has team_a/team_b as readonly tuples of length 2', () => {
    expectTypeOf<MatchForScoring['team_a']>().toEqualTypeOf<readonly [string, string]>();
  });
  it('Result is a discriminated union', () => {
    const ok: Result<number> = { success: true, data: 1 };
    const fail: Result<number> = { success: false, error: { code: 'X', message: 'y' } };
    expect(ok.success && ok.data === 1).toBe(true);
    expect(!fail.success && fail.error.code === 'X').toBe(true);
  });
});
