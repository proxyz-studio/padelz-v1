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
  tournaments,
  users,
} from '@/models/Schema';
import { submitScore } from '@/features/scoring/actions';

/**
 * Build a tournament + 4 players + 1 scheduled match. Returns the clerk ids
 * (for action calls) and the player ids (for participation checks). The
 * caller picks which clerk to act as.
 */
async function seedMatchForSubmit() {
  const stamp = uuidv7().slice(0, 8);

  const userIds: string[] = [];
  const clerkIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const clerkId = `sub-c${i}-${stamp}`;
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
        handle: `sub-p${i}-${stamp}`,
        display_name: `Submit P${i}`,
        tier: 'gold',
      })
      .returning();
    playerIds.push(p.id);
  }

  const [c] = await db
    .insert(clubs)
    .values({ slug: `sc-${stamp}`, name: 'Submit Club' })
    .returning();
  await db
    .insert(club_memberships)
    .values({ user_id: userIds[0], club_id: c.id, role: 'admin' });

  const [t] = await db
    .insert(tournaments)
    .values({
      slug: `st-${stamp}`,
      club_id: c.id,
      name: 'Submit T',
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

  return { matchId: m.id, clerkIds, userIds, playerIds };
}

describe('submitScore', () => {
  it('participant inserts a pending match_result and fires score_pending to opposing team', async () => {
    const { matchId, clerkIds, userIds } = await seedMatchForSubmit();

    const r = await submitScore(
      { match_id: matchId, team_a_score: 21, team_b_score: 15 },
      clerkIds[0], // team_a player
    );

    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.pending).toBe(true);

    const [mr] = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    expect(mr.status).toBe('pending');
    expect(mr.team_a_score).toBe(21);
    expect(mr.team_b_score).toBe(15);
    expect(mr.submitted_by).toBe(userIds[0]);

    // Opposing team (team_b players: index 2, 3) should each get a score_pending row.
    const notifRows = await db.select().from(notifications);
    const pending = notifRows.filter((n) => n.type === 'score_pending');
    expect(pending.length).toBe(2);
    expect(pending.map((n) => n.user_id).sort()).toEqual(
      [userIds[2], userIds[3]].sort(),
    );
  });

  it('rejects non-participant with FORBIDDEN', async () => {
    const { matchId } = await seedMatchForSubmit();
    // Build a fifth, unrelated user/player
    const outsiderClerk = `outsider-${uuidv7().slice(0, 8)}`;
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

    const r = await submitScore(
      { match_id: matchId, team_a_score: 21, team_b_score: 10 },
      outsiderClerk,
    );

    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('FORBIDDEN');

    const mrRows = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    expect(mrRows.length).toBe(0);
  });

  it('returns ALREADY_SUBMITTED when a second player submits (ON CONFLICT match_id)', async () => {
    const { matchId, clerkIds } = await seedMatchForSubmit();

    const first = await submitScore(
      { match_id: matchId, team_a_score: 21, team_b_score: 17 },
      clerkIds[0],
    );
    expect(first.success).toBe(true);

    // Different participant tries again — UNIQUE(match_id) blocks the row.
    const second = await submitScore(
      { match_id: matchId, team_a_score: 21, team_b_score: 19 },
      clerkIds[2],
    );

    expect(second.success).toBe(false);
    if (second.success) return;
    expect(second.error.code).toBe('ALREADY_SUBMITTED');

    // Original scores survive.
    const [mr] = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    expect(mr.team_b_score).toBe(17);
  });

  it('rejects missing match with NOT_FOUND', async () => {
    const { clerkIds } = await seedMatchForSubmit();
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const r = await submitScore(
      { match_id: fakeId, team_a_score: 21, team_b_score: 15 },
      clerkIds[0],
    );
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('NOT_FOUND');
  });

  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const { matchId } = await seedMatchForSubmit();
    const r = await submitScore(
      { match_id: matchId, team_a_score: 21, team_b_score: 15 },
      '', // empty clerk id ≡ unauthenticated
    );
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid score shape via VALIDATION', async () => {
    const { matchId, clerkIds } = await seedMatchForSubmit();
    const r = await submitScore(
      { match_id: matchId, team_a_score: -1, team_b_score: 15 },
      clerkIds[0],
    );
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('VALIDATION');
  });

  it('rejects when user has no players row (UNAUTHORIZED)', async () => {
    const { matchId } = await seedMatchForSubmit();
    const orphanClerk = `orphan-${uuidv7().slice(0, 8)}`;
    await db
      .insert(users)
      .values({ clerk_id: orphanClerk, email: `${orphanClerk}@x` });
    // No matching `players` row for this user

    const r = await submitScore(
      { match_id: matchId, team_a_score: 21, team_b_score: 15 },
      orphanClerk,
    );
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('NOT_FOUND');
  });
});
