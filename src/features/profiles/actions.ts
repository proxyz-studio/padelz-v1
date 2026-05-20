'use server';
import { z } from 'zod';
import { db } from '@/libs/DB';
import { matches, players, points_ledger, tier_history, tournaments, users } from '@/models/Schema';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { TIERS, type Tier } from './types';
import { createNotification } from '@/features/notifications/actions';
import type { Result } from '@/features/scoring/types';

const PromoteSchema = z.object({
  player_id: z.string().uuid(),
  new_tier: z.enum(TIERS),
  reason: z.enum(['auto_promote', 'auto_demote', 'manual']),
});

export async function promotePlayer(input: {
  player_id: string;
  new_tier: Tier;
  reason: 'auto_promote' | 'auto_demote' | 'manual';
}): Promise<Result<{ player_id: string; new_tier: Tier }>> {
  const parsed = PromoteSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: { code: 'VALIDATION', message: parsed.error.message } };

  const userId = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(players).where(eq(players.id, parsed.data.player_id));
    if (!p) throw new Error('Player not found');

    await tx.update(tier_history)
      .set({ to_date: new Date() })
      .where(and(eq(tier_history.player_id, p.id), isNull(tier_history.to_date)));

    await tx.insert(tier_history).values({
      player_id: p.id,
      tier: parsed.data.new_tier,
      from_date: new Date(),
      reason: parsed.data.reason,
    });

    await tx.update(players).set({ tier: parsed.data.new_tier }).where(eq(players.id, p.id));

    return p.user_id;
  });

  await createNotification({
    user_ids: [userId],
    type: 'tier_promoted',
    payload: { new_tier: parsed.data.new_tier, reason: parsed.data.reason },
  });

  return { success: true, data: { player_id: parsed.data.player_id, new_tier: parsed.data.new_tier } };
}

// ── Points history ────────────────────────────────────────────────────────────

export type PointsHistoryEntry = {
  id: string;
  match_id: string;
  tournament_id: string;
  tournament_name: string;
  tournament_slug: string;
  opponent_handle: string;
  opponent_display_name: string;
  points: number;
  earned_at: Date;
  running_total: number;
};

export type MyPointsResult = {
  entries: PointsHistoryEntry[];
  total: number;
  player_id: string | null;
  player_handle: string | null;
  player_display_name: string | null;
  player_tier: Tier | null;
};

/**
 * Returns the signed-in player's most recent points-ledger entries with
 * tournament + opponent context, ordered newest first. Running totals are
 * computed in the order of return (newest entry shows current total). Also
 * returns the player's header metadata (display name, tier, total) so the
 * page can render the header block in a single round trip plus query batch.
 */
export async function getMyPointsHistory(
  clerkUserId: string,
  limit: number = 50,
): Promise<MyPointsResult> {
  const empty: MyPointsResult = {
    entries: [],
    total: 0,
    player_id: null,
    player_handle: null,
    player_display_name: null,
    player_tier: null,
  };
  const [u] = await db.select().from(users).where(eq(users.clerk_id, clerkUserId)).limit(1);
  if (!u) return empty;

  const [p] = await db.select().from(players).where(eq(players.user_id, u.id)).limit(1);
  if (!p) return empty;

  // Last N ledger rows for this player
  const ledger = await db
    .select({
      id: points_ledger.id,
      match_id: points_ledger.match_id,
      points: points_ledger.points,
      earned_at: points_ledger.earned_at,
    })
    .from(points_ledger)
    .where(eq(points_ledger.player_id, p.id))
    .orderBy(desc(points_ledger.earned_at))
    .limit(limit);

  if (ledger.length === 0) {
    return {
      entries: [],
      total: 0,
      player_id: p.id,
      player_handle: p.handle,
      player_display_name: p.display_name,
      player_tier: p.tier as Tier,
    };
  }

  // Total points across ALL ledger rows (not just the limit)
  const allLedger = await db
    .select({ points: points_ledger.points })
    .from(points_ledger)
    .where(eq(points_ledger.player_id, p.id));
  const total = allLedger.reduce((sum, e) => sum + Number(e.points), 0);

  // Hydrate match + tournament + opponent for each entry
  const matchIds = ledger.map((l) => l.match_id);
  const matchRows = await db
    .select({
      id: matches.id,
      team_a: matches.team_a,
      team_b: matches.team_b,
      tournament_id: matches.tournament_id,
    })
    .from(matches)
    .where(inArray(matches.id, matchIds));
  const matchMap = new Map(matchRows.map((m) => [m.id, m]));

  const tournamentIds = [...new Set(matchRows.map((m) => m.tournament_id))];
  const tournamentRows = await db
    .select({ id: tournaments.id, name: tournaments.name, slug: tournaments.slug })
    .from(tournaments)
    .where(inArray(tournaments.id, tournamentIds));
  const tournamentMap = new Map(tournamentRows.map((t) => [t.id, t]));

  // Resolve opponent player_ids: for each match, take the team this player is NOT in
  const opponentIds = new Set<string>();
  for (const m of matchRows) {
    const isInA = m.team_a.includes(p.id);
    const opp = isInA ? m.team_b : m.team_a;
    for (const id of opp) opponentIds.add(id);
  }
  const opponentRows = opponentIds.size > 0
    ? await db
        .select({ id: players.id, handle: players.handle, display_name: players.display_name })
        .from(players)
        .where(inArray(players.id, Array.from(opponentIds)))
    : [];
  const opponentMap = new Map(opponentRows.map((o) => [o.id, o]));

  // Build entries with running totals (descending order: newest first reflects current total)
  let runningTotal = total;
  const entries: PointsHistoryEntry[] = [];
  for (const l of ledger) {
    const m = matchMap.get(l.match_id);
    if (!m) continue;
    const t = tournamentMap.get(m.tournament_id);
    if (!t) continue;
    const isInA = m.team_a.includes(p.id);
    const oppIds = isInA ? m.team_b : m.team_a;
    const oppRow = oppIds.length > 0 ? opponentMap.get(oppIds[0]) : undefined;
    entries.push({
      id: l.id,
      match_id: l.match_id,
      tournament_id: t.id,
      tournament_name: t.name,
      tournament_slug: t.slug,
      opponent_handle: oppRow?.handle ?? '?',
      opponent_display_name: oppRow?.display_name ?? '?',
      points: Number(l.points),
      earned_at: l.earned_at,
      running_total: runningTotal,
    });
    runningTotal -= Number(l.points);
  }

  return {
    entries,
    total,
    player_id: p.id,
    player_handle: p.handle,
    player_display_name: p.display_name,
    player_tier: p.tier as Tier,
  };
}
