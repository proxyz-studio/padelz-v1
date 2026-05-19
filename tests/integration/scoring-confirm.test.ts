import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  club_memberships,
  clubs,
  match_results,
  matches,
  notifications,
  players,
  points_ledger,
  tournaments,
  users,
} from '@/models/Schema';
import { confirmScore, submitScore } from '@/features/scoring/actions';

/**
 * Build a pending submission: 4 players, 1 tournament, 1 match, plus a
 * match_results row already in 'pending' submitted by team_a player 0.
 * Returns ids needed by tests.
 */
async function seedPendingMatch() {
  const stamp = uuidv7().slice(0, 8);

  const userIds: string[] = [];
  const clerkIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const clerkId = `cnf-c${i}-${stamp}`;
    clerkIds.push(clerkId);
    const [u] = await db
      .insert(users)
      .values({ clerk_id: clerkId, email: `${clerkId}@x` })
      .returning();
    userIds.push(u.id);
  }

  const playerIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const [p] = await db
      .insert(players)
      .values({
        user_id: userIds[i],
        handle: `cnf-p${i}-${stamp}`,
        display_name: `Confirm P${i}`,
        tier: 'gold',
      })
      .returning();
    playerIds.push(p.id);
  }

  const [c] = await db
    .insert(clubs)
    .values({ slug: `cnc-${stamp}`, name: 'Confirm Club' })
    .returning();
  await db
    .insert(club_memberships)
    .values({ user_id: userIds[0], club_id: c.id, role: 'admin' });

  const [t] = await db
    .insert(tournaments)
    .values({
      slug: `cnt-${stamp}`,
      club_id: c.id,
      name: 'Confirm T',
      format: 'americano',
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 86_400_000),
      status: 'open',
      created_by: userIds[0],
    })
    .returning();

  const [m] = await db
    .insert(matches)
    .values({
      tournament_id: t.id,
      team_a: [playerIds[0], playerIds[1]],
      team_b: [playerIds[2], playerIds[3]],
      status: 'scheduled',
    })
    .returning();

  // Seed pending via the real submitScore action so the score_pending
  // notifications also exist (lets us assert the additional score_confirmed
  // fan-out on top).
  const sub = await submitScore(
    { match_id: m.id, team_a_score: 21, team_b_score: 15 },
    clerkIds[0],
  );
  if (!sub.success) throw new Error(`seed submit failed: ${sub.error.code}`);

  return { matchId: m.id, clerkIds, userIds, playerIds };
}

describe('confirmScore', () => {
  it('opposite-team confirm flips status, writes ledger, notifies all 4 participants', async () => {
    const { matchId, clerkIds, userIds } = await seedPendingMatch();

    const r = await confirmScore({ match_id: matchId }, clerkIds[2]);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.alreadyConfirmed).toBe(false);

    const [mr] = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    expect(mr.status).toBe('confirmed');
    expect(mr.confirmed_by).toBe(userIds[2]);
    expect(mr.confirmed_at).not.toBeNull();

    // Ledger: 4 rows (one per participant)
    const ledger = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(ledger.length).toBe(4);

    // score_confirmed notification fans to all 4 user_ids (in addition to
    // the 2 score_pending notifications from the seed submitScore call).
    const confirmedNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'score_confirmed'));
    expect(confirmedNotifs.length).toBe(4);
    expect(confirmedNotifs.map((n) => n.user_id).sort()).toEqual(
      [...userIds].sort(),
    );
  });

  it('same-team confirm returns CONFLICT_OF_INTEREST and does not change state', async () => {
    const { matchId, clerkIds } = await seedPendingMatch();
    // clerkIds[1] is on team_a, same as submitter clerkIds[0].
    const r = await confirmScore({ match_id: matchId }, clerkIds[1]);

    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('CONFLICT_OF_INTEREST');

    const [mr] = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    expect(mr.status).toBe('pending');
    expect(mr.confirmed_by).toBeNull();

    const ledger = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(ledger.length).toBe(0);
  });

  it('second confirm by other opposing player is idempotent (alreadyConfirmed=true)', async () => {
    const { matchId, clerkIds } = await seedPendingMatch();
    const first = await confirmScore({ match_id: matchId }, clerkIds[2]);
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.data.alreadyConfirmed).toBe(false);

    // Other opposing-team player follows up — already confirmed, no-op.
    const second = await confirmScore({ match_id: matchId }, clerkIds[3]);
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.data.alreadyConfirmed).toBe(true);

    // Ledger still 4 rows (no duplicates due to UNIQUE(player_id, match_id))
    const ledger = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(ledger.length).toBe(4);

    // score_confirmed notifications still 4 (no second fan-out).
    const confirmedNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'score_confirmed'));
    expect(confirmedNotifs.length).toBe(4);
  });

  it('non-participant returns NOT_FOUND (404 not 403 to avoid leaking match existence)', async () => {
    const { matchId } = await seedPendingMatch();
    const outsiderClerk = `cnf-outsider-${uuidv7().slice(0, 8)}`;
    const [u] = await db
      .insert(users)
      .values({ clerk_id: outsiderClerk, email: `${outsiderClerk}@x` })
      .returning();
    await db.insert(players).values({
      user_id: u.id,
      handle: outsiderClerk,
      display_name: 'Outsider',
      tier: 'gold',
    });

    const r = await confirmScore({ match_id: matchId }, outsiderClerk);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND when match has no pending result yet', async () => {
    // Build a match without a result row.
    const stamp = uuidv7().slice(0, 8);
    const userIds: string[] = [];
    const clerkIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const clerkId = `noresult-c${i}-${stamp}`;
      clerkIds.push(clerkId);
      const [u] = await db
        .insert(users)
        .values({ clerk_id: clerkId, email: `${clerkId}@x` })
        .returning();
      userIds.push(u.id);
    }
    const playerIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const [p] = await db
        .insert(players)
        .values({
          user_id: userIds[i],
          handle: `noresult-p${i}-${stamp}`,
          display_name: `NoR P${i}`,
          tier: 'gold',
        })
        .returning();
      playerIds.push(p.id);
    }
    const [c] = await db
      .insert(clubs)
      .values({ slug: `nrc-${stamp}`, name: 'No Result Club' })
      .returning();
    const [t] = await db
      .insert(tournaments)
      .values({
        slug: `nrt-${stamp}`,
        club_id: c.id,
        name: 'No Result T',
        format: 'americano',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000),
        status: 'open',
        created_by: userIds[0],
      })
      .returning();
    const [m] = await db
      .insert(matches)
      .values({
        tournament_id: t.id,
        team_a: [playerIds[0], playerIds[1]],
        team_b: [playerIds[2], playerIds[3]],
        status: 'scheduled',
      })
      .returning();

    const r = await confirmScore({ match_id: m.id }, clerkIds[2]);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('NOT_FOUND');
  });

  it('rejects unauthenticated caller', async () => {
    const { matchId } = await seedPendingMatch();
    const r = await confirmScore({ match_id: matchId }, '');
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('UNAUTHORIZED');
  });
});
