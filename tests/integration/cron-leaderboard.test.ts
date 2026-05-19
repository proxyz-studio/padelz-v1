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
  tier_history,
  tournaments,
  users,
} from '@/models/Schema';
import { POST } from '@/app/api/cron/leaderboard/route';
import { currentWeekStartICT } from '@/features/leaderboard/snapshot';

// We import Env to get the stub CRON_SECRET set in .env.local
import { Env } from '@/libs/Env';

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/leaderboard', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

async function seedPlayerWithLedger(
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond',
  suffix: string,
  earnedAt: Date,
  points = 40,
) {
  const clerkId = `ck-cl-${suffix}`;
  const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x.test` }).returning();
  const [p] = await db
    .insert(players)
    .values({ user_id: u.id, handle: `cl-${suffix}`, display_name: `CL ${suffix}`, tier })
    .returning();
  await db.insert(tier_history).values({
    player_id: p.id,
    tier,
    from_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    reason: 'initial',
  });

  const [c] = await db.insert(clubs).values({ slug: `cl-club-${suffix}`, name: `Club ${suffix}` }).returning();
  const [t] = await db
    .insert(tournaments)
    .values({
      slug: `cl-t-${suffix}`,
      club_id: c.id,
      name: `T ${suffix}`,
      format: 'americano',
      start_at: new Date(),
      created_by: u.id,
    })
    .returning();
  const [m] = await db
    .insert(matches)
    .values({ tournament_id: t.id, team_a: [], team_b: [] })
    .returning();
  await db.insert(points_ledger).values({
    player_id: p.id,
    match_id: m.id,
    points: points.toString(),
    breakdown: {},
    earned_at: earnedAt,
  });

  return { userId: u.id, playerId: p.id };
}

describe('POST /api/cron/leaderboard', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const res = await POST(makeRequest('Bearer wrong-secret-xxxxxxxxxxxxxxxxxxxx'));
    expect(res.status).toBe(401);
  });

  it('returns 200 with correct secret and runs snapshot rebuild', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();

    await seedPlayerWithLedger('bronze', stamp, new Date(weekStart.getTime() + 5000));

    const res = await POST(makeRequest(`Bearer ${Env.CRON_SECRET}`));
    expect(res.status).toBe(200);

    const body = await res.json() as { ok: boolean; promoted: number };
    expect(body.ok).toBe(true);
    expect(typeof body.promoted).toBe('number');

    // snapshot row should now exist for this week
    const snapshots = await db
      .select()
      .from(leaderboard_snapshots)
      .where(
        and(
          eq(leaderboard_snapshots.period, 'week'),
          eq(leaderboard_snapshots.tier, 'bronze'),
        ),
      );
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
  });

  it('also rebuilds the month snapshot', async () => {
    const stamp = uuidv7().slice(0, 8);
    const weekStart = currentWeekStartICT();

    await seedPlayerWithLedger('silver', `m-${stamp}`, new Date(weekStart.getTime() + 5000));

    const res = await POST(makeRequest(`Bearer ${Env.CRON_SECRET}`));
    expect(res.status).toBe(200);

    // month snapshot should exist too
    const monthSnaps = await db
      .select()
      .from(leaderboard_snapshots)
      .where(eq(leaderboard_snapshots.period, 'month'));
    expect(monthSnaps.length).toBeGreaterThanOrEqual(1);
  });
});
