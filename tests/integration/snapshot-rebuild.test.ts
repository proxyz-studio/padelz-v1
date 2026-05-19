import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq, and } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  clubs,
  leaderboard_snapshots,
  matches,
  players,
  points_ledger,
  tournaments,
  users,
} from '@/models/Schema';
import { currentWeekStartICT, rebuildSnapshot } from '@/features/leaderboard/snapshot';

/**
 * Seed a minimal player with a user. Returns { userId, playerId }.
 */
async function seedPlayer(tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond', suffix: string) {
  const clerkId = `ck-${suffix}`;
  const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x.test` }).returning();
  const [p] = await db
    .insert(players)
    .values({ user_id: u.id, handle: `h-${suffix}`, display_name: `P ${suffix}`, tier })
    .returning();
  return { userId: u.id, playerId: p.id };
}

/**
 * Seed a club + tournament (minimum required to create a match).
 */
async function seedTournament(adminUserId: string, suffix: string) {
  const [c] = await db.insert(clubs).values({ slug: `club-${suffix}`, name: `Club ${suffix}` }).returning();
  const [t] = await db
    .insert(tournaments)
    .values({
      slug: `t-${suffix}`,
      club_id: c.id,
      name: `T ${suffix}`,
      format: 'americano',
      tier_min: 'bronze',
      tier_max: 'diamond',
      status: 'open',
      start_at: new Date(),
      created_by: adminUserId,
    })
    .returning();
  return { clubId: c.id, tournamentId: t.id };
}

/**
 * Insert a fake match + a ledger row for a player at a given earned_at timestamp.
 */
async function seedLedgerEntry(
  playerId: string,
  tournamentId: string,
  points: number,
  earnedAt: Date,
) {
  const [m] = await db
    .insert(matches)
    .values({ tournament_id: tournamentId, team_a: [], team_b: [] })
    .returning();
  await db.insert(points_ledger).values({
    player_id: playerId,
    match_id: m.id,
    points: points.toString(),
    breakdown: {},
    earned_at: earnedAt,
  });
}

describe('rebuildSnapshot', () => {
  it('only includes players with >= 1 match in the period', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();

    const { playerId: pA } = await seedPlayer('gold', `a-${stamp}`);
    const { playerId: pB } = await seedPlayer('gold', `b-${stamp}`);
    const { playerId: _pC } = await seedPlayer('gold', `c-${stamp}`); // no ledger entries
    const { userId: adminId } = await seedPlayer('gold', `adm-${stamp}`);
    const { tournamentId } = await seedTournament(adminId, stamp);

    // A has 2 matches, B has 1 match, C has 0
    await seedLedgerEntry(pA, tournamentId, 30, new Date(weekStart.getTime() + 1000));
    await seedLedgerEntry(pA, tournamentId, 25, new Date(weekStart.getTime() + 2000));
    await seedLedgerEntry(pB, tournamentId, 20, new Date(weekStart.getTime() + 3000));

    await rebuildSnapshot('week', weekStart);

    const rows = await db
      .select()
      .from(leaderboard_snapshots)
      .where(and(eq(leaderboard_snapshots.period, 'week'), eq(leaderboard_snapshots.tier, 'gold')));

    expect(rows.length).toBe(2);
    const playerIds = rows.map((r) => r.player_id);
    expect(playerIds).toContain(pA);
    expect(playerIds).toContain(pB);
  });

  it('ranks deterministically: points_sum DESC then match_count DESC then older player wins', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();

    // pOlder gets created first (default db insert ordering)
    const { playerId: pOlder } = await seedPlayer('silver', `old-${stamp}`);
    // small delay so created_at differs
    await new Promise((r) => setTimeout(r, 10));
    const { playerId: pNewer } = await seedPlayer('silver', `new-${stamp}`);
    const { userId: adminId } = await seedPlayer('silver', `adm-${stamp}`);
    const { tournamentId } = await seedTournament(adminId, `r-${stamp}`);

    // same points (50), same match count (1)
    await seedLedgerEntry(pOlder, tournamentId, 50, new Date(weekStart.getTime() + 1000));
    await seedLedgerEntry(pNewer, tournamentId, 50, new Date(weekStart.getTime() + 2000));

    await rebuildSnapshot('week', weekStart);

    const rows = await db
      .select()
      .from(leaderboard_snapshots)
      .where(and(eq(leaderboard_snapshots.period, 'week'), eq(leaderboard_snapshots.tier, 'silver')));

    const olderRow = rows.find((r) => r.player_id === pOlder)!;
    const newerRow = rows.find((r) => r.player_id === pNewer)!;
    expect(olderRow).toBeDefined();
    expect(newerRow).toBeDefined();
    expect(olderRow.rank).toBe(1);
    expect(newerRow.rank).toBe(2);
  });

  it('marks rows as stale=false and stamps rebuilt_at with a recent timestamp', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();
    const before = new Date();

    const { playerId: pA } = await seedPlayer('bronze', `b-${stamp}`);
    const { userId: adminId } = await seedPlayer('bronze', `adm-${stamp}`);
    const { tournamentId } = await seedTournament(adminId, `s-${stamp}`);
    await seedLedgerEntry(pA, tournamentId, 10, new Date(weekStart.getTime() + 1000));

    await rebuildSnapshot('week', weekStart);

    const [row] = await db
      .select()
      .from(leaderboard_snapshots)
      .where(eq(leaderboard_snapshots.player_id, pA));

    expect(row.stale).toBe(false);
    expect(row.rebuilt_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('upserts idempotently on re-run — no duplicate rows', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();

    const { playerId: pA } = await seedPlayer('platinum', `p-${stamp}`);
    const { userId: adminId } = await seedPlayer('platinum', `adm-${stamp}`);
    const { tournamentId } = await seedTournament(adminId, `u-${stamp}`);
    await seedLedgerEntry(pA, tournamentId, 40, new Date(weekStart.getTime() + 1000));

    await rebuildSnapshot('week', weekStart);
    await rebuildSnapshot('week', weekStart); // second run

    const rows = await db
      .select()
      .from(leaderboard_snapshots)
      .where(
        and(eq(leaderboard_snapshots.period, 'week'), eq(leaderboard_snapshots.player_id, pA)),
      );

    expect(rows.length).toBe(1); // idempotent: still just 1
  });

  it('excludes ledger entries outside the period window', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();
    const prevWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { playerId: pA } = await seedPlayer('gold', `ow-${stamp}`);
    const { userId: adminId } = await seedPlayer('gold', `adm-${stamp}`);
    const { tournamentId } = await seedTournament(adminId, `w-${stamp}`);

    // only entry is in previous week — must not appear in current week snapshot
    await seedLedgerEntry(pA, tournamentId, 30, new Date(prevWeekStart.getTime() + 1000));

    await rebuildSnapshot('week', weekStart);

    const rows = await db
      .select()
      .from(leaderboard_snapshots)
      .where(and(eq(leaderboard_snapshots.period, 'week'), eq(leaderboard_snapshots.player_id, pA)));

    expect(rows.length).toBe(0);
  });

  it('currentWeekStartICT returns a Monday at 00:00 ICT (17:00 UTC previous Sunday)', () => {
    const ws = currentWeekStartICT();
    // Shift to ICT to check day-of-week
    const ict = new Date(ws.getTime() + 7 * 60 * 60 * 1000);
    expect(ict.getUTCDay()).toBe(1); // Monday
    expect(ict.getUTCHours()).toBe(0);
    expect(ict.getUTCMinutes()).toBe(0);
  });
});
