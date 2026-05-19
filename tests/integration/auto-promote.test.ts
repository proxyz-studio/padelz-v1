import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  clubs,
  leaderboard_snapshots,
  matches,
  notifications,
  players,
  points_ledger,
  tier_history,
  tournaments,
  users,
} from '@/models/Schema';
import { checkAutoPromote } from '@/features/leaderboard/autopromote';
import { currentWeekStartICT } from '@/features/leaderboard/snapshot';

/**
 * Seed a user + player at the given tier.
 */
async function seedPlayer(
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond',
  suffix: string,
) {
  const clerkId = `ck-ap-${suffix}`;
  const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x.test` }).returning();
  const [p] = await db
    .insert(players)
    .values({ user_id: u.id, handle: `ap-${suffix}`, display_name: `AP ${suffix}`, tier })
    .returning();
  // open tier_history row so promotePlayer can close it
  await db.insert(tier_history).values({
    player_id: p.id,
    tier,
    from_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    reason: 'initial',
  });
  return { userId: u.id, playerId: p.id };
}

/**
 * Insert 4 weekly snapshot rows for a player so they look like they've held
 * rank `rank` in tier `tier` for 4 consecutive weeks ending at `currentWeekStart`.
 * matchCount is applied per snapshot row.
 */
async function seed4WeekSnapshots(
  playerId: string,
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond',
  rank: number,
  matchCount: number,
  currentWeekStart: Date,
) {
  for (let i = 0; i < 4; i++) {
    const weekOffset = (3 - i) * 7 * 24 * 60 * 60 * 1000; // oldest first
    const periodStart = new Date(currentWeekStart.getTime() - weekOffset);
    await db.insert(leaderboard_snapshots).values({
      period: 'week',
      period_start: periodStart.toISOString().slice(0, 10),
      tier,
      player_id: playerId,
      rank,
      points_sum: '100',
      match_count: matchCount,
      stale: false,
    });
  }
}

describe('checkAutoPromote', () => {
  it('promotes a silver player with 4 consecutive top-3 weeks and >= 4 cumulative matches', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();

    const { userId, playerId } = await seedPlayer('silver', stamp);
    // 4 weeks × rank=1 × matchCount=1 → 4 cumulative
    await seed4WeekSnapshots(playerId, 'silver', 1, 1, weekStart);

    const result = await checkAutoPromote(weekStart);
    expect(result.promoted).toBe(1);

    const [updated] = await db.select().from(players).where(eq(players.id, playerId));
    expect(updated.tier).toBe('gold');

    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, userId));
    expect(notifs.some((n) => n.type === 'tier_promoted')).toBe(true);
  });

  it('does NOT promote a player with only 3 consecutive top-3 weeks', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();

    const { playerId } = await seedPlayer('bronze', `3w-${stamp}`);
    // only 3 rows (missing oldest)
    for (let i = 0; i < 3; i++) {
      const weekOffset = (2 - i) * 7 * 24 * 60 * 60 * 1000;
      const periodStart = new Date(weekStart.getTime() - weekOffset);
      await db.insert(leaderboard_snapshots).values({
        period: 'week',
        period_start: periodStart.toISOString().slice(0, 10),
        tier: 'bronze',
        player_id: playerId,
        rank: 1,
        points_sum: '80',
        match_count: 1,
        stale: false,
      });
    }

    const result = await checkAutoPromote(weekStart);
    expect(result.promoted).toBe(0);

    const [p] = await db.select().from(players).where(eq(players.id, playerId));
    expect(p.tier).toBe('bronze');
  });

  it('does NOT promote a player with 4 top-3 weeks but only 2 cumulative matches', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();

    const { playerId } = await seedPlayer('bronze', `thin-${stamp}`);
    // 4 weeks but matchCount=0 for most rows — total < 4
    for (let i = 0; i < 4; i++) {
      const weekOffset = (3 - i) * 7 * 24 * 60 * 60 * 1000;
      const periodStart = new Date(weekStart.getTime() - weekOffset);
      await db.insert(leaderboard_snapshots).values({
        period: 'week',
        period_start: periodStart.toISOString().slice(0, 10),
        tier: 'bronze',
        player_id: playerId,
        rank: 1,
        points_sum: '50',
        match_count: i === 0 ? 2 : 0, // total = 2 across 4 weeks
        stale: false,
      });
    }

    const result = await checkAutoPromote(weekStart);
    expect(result.promoted).toBe(0);
  });

  it('does NOT promote a player who appeared at rank > 3 in one week', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();

    const { playerId } = await seedPlayer('gold', `r4-${stamp}`);
    for (let i = 0; i < 4; i++) {
      const weekOffset = (3 - i) * 7 * 24 * 60 * 60 * 1000;
      const periodStart = new Date(weekStart.getTime() - weekOffset);
      await db.insert(leaderboard_snapshots).values({
        period: 'week',
        period_start: periodStart.toISOString().slice(0, 10),
        tier: 'gold',
        player_id: playerId,
        rank: i === 2 ? 4 : 1, // one week at rank 4
        points_sum: '80',
        match_count: 1,
        stale: false,
      });
    }

    const result = await checkAutoPromote(weekStart);
    expect(result.promoted).toBe(0);
  });

  it('does NOT promote a diamond player (top tier ceiling)', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();

    const { playerId } = await seedPlayer('diamond', `dia-${stamp}`);
    await seed4WeekSnapshots(playerId, 'diamond', 1, 1, weekStart);

    const result = await checkAutoPromote(weekStart);
    expect(result.promoted).toBe(0);

    const [p] = await db.select().from(players).where(eq(players.id, playerId));
    expect(p.tier).toBe('diamond');
  });

  it('is idempotent — second call in same period promotes 0 additional players', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();

    const { playerId } = await seedPlayer('bronze', `idem-${stamp}`);
    await seed4WeekSnapshots(playerId, 'bronze', 1, 1, weekStart);

    const r1 = await checkAutoPromote(weekStart);
    expect(r1.promoted).toBe(1);

    // After promotion player tier is silver; their old snapshot tier was bronze.
    // A second call on same weekStart: the player's current tier changed,
    // so they no longer match (MIN(tier) !== MAX(tier) across windows won't apply
    // because snapshots still show bronze). The advisory lock test is hard to exercise
    // in a single-thread integration test; we verify outcome-idempotency instead.
    const r2 = await checkAutoPromote(weekStart);
    // May be 0 (lock acquired again but no new eligible candidates after tier bump)
    // or if the lock prevented re-entry, also 0. Either way: not 1 again.
    expect(r2.promoted).toBe(0);
  });
});
