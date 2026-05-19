import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  club_memberships,
  clubs,
  leaderboard_snapshots,
  match_results,
  matches,
  notifications,
  players,
  points_ledger,
  tournaments,
  users,
} from '@/models/Schema';
import {
  adminOverrideMatch,
  adminVoidMatch,
  disputeScore,
  submitScore,
} from '@/features/scoring/actions';

/**
 * Seeds a tournament + 4 players + 1 match. The first participant is also the
 * club admin (handy for the override-by-participant CONFLICT test). A second
 * "outside" admin user is created and made a club admin too — that user has
 * no players row, so they're a safe overrider.
 */
async function seedTournamentWithAdmin() {
  const stamp = uuidv7().slice(0, 8);
  const userIds: string[] = [];
  const clerkIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const clerkId = `adm-c${i}-${stamp}`;
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
        handle: `adm-p${i}-${stamp}`,
        display_name: `Adm P${i}`,
        tier: 'gold',
      })
      .returning();
    playerIds.push(p.id);
  }

  // Outside admin: club admin, but no players row (so participation check
  // passes cleanly).
  const outsideAdminClerk = `adm-out-${stamp}`;
  const [outsideAdminUser] = await db
    .insert(users)
    .values({ clerk_id: outsideAdminClerk, email: `${outsideAdminClerk}@x` })
    .returning();

  const [c] = await db
    .insert(clubs)
    .values({ slug: `adc-${stamp}`, name: 'Admin Club' })
    .returning();
  // Both userIds[0] (participant) and outsideAdminUser are admins of the club.
  await db.insert(club_memberships).values([
    { user_id: userIds[0], club_id: c.id, role: 'admin' },
    { user_id: outsideAdminUser.id, club_id: c.id, role: 'admin' },
  ]);

  const [t] = await db
    .insert(tournaments)
    .values({
      slug: `adt-${stamp}`,
      club_id: c.id,
      name: 'Admin T',
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

  return {
    matchId: m.id,
    tournamentId: t.id,
    clubId: c.id,
    clerkIds,
    userIds,
    playerIds,
    outsideAdminClerk,
    outsideAdminUserId: outsideAdminUser.id,
  };
}

// ── disputeScore ─────────────────────────────────────────────────────────────

describe('disputeScore', () => {
  it('opposite-team participant transitions pending → disputed and notifies club admins', async () => {
    const { matchId, clerkIds, outsideAdminUserId, userIds } =
      await seedTournamentWithAdmin();
    // Seed a pending submission from team_a player 0.
    const sub = await submitScore(
      { match_id: matchId, team_a_score: 21, team_b_score: 19 },
      clerkIds[0],
    );
    expect(sub.success).toBe(true);

    // Team_b player disputes.
    const r = await disputeScore({ match_id: matchId }, clerkIds[2]);
    expect(r.success).toBe(true);

    const [mr] = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    expect(mr.status).toBe('disputed');

    const disputedNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'score_disputed'));
    // Both club admins (userIds[0] participant + outsideAdminUserId) should
    // be notified. The spec says "all club admins of tournament's club".
    expect(disputedNotifs.map((n) => n.user_id).sort()).toEqual(
      [userIds[0], outsideAdminUserId].sort(),
    );
  });

  it('non-participant returns NOT_FOUND', async () => {
    const { matchId, clerkIds } = await seedTournamentWithAdmin();
    await submitScore(
      { match_id: matchId, team_a_score: 21, team_b_score: 17 },
      clerkIds[0],
    );

    const outsiderClerk = `disp-out-${uuidv7().slice(0, 8)}`;
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

    const r = await disputeScore({ match_id: matchId }, outsiderClerk);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('NOT_FOUND');
  });

  it('rejects when no pending result exists', async () => {
    const { matchId, clerkIds } = await seedTournamentWithAdmin();
    const r = await disputeScore({ match_id: matchId }, clerkIds[2]);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('NOT_FOUND');
  });
});

// ── adminOverrideMatch ──────────────────────────────────────────────────────

describe('adminOverrideMatch', () => {
  it('non-participant club admin can override a pending result, rewrites ledger, marks snapshots stale, notifies all 4', async () => {
    const { matchId, clerkIds, userIds, outsideAdminClerk, playerIds } =
      await seedTournamentWithAdmin();
    await submitScore(
      { match_id: matchId, team_a_score: 10, team_b_score: 21 },
      clerkIds[0],
    );

    // Seed a non-stale snapshot for one participant's tier so we can verify
    // it gets flipped.
    await db.insert(leaderboard_snapshots).values({
      period: 'week',
      period_start: '2026-05-18',
      tier: 'gold',
      player_id: playerIds[0],
      rank: 1,
      points_sum: '50.00',
      match_count: 1,
      stale: false,
    });

    const r = await adminOverrideMatch(
      { match_id: matchId, team_a_score: 21, team_b_score: 18 },
      outsideAdminClerk,
    );
    expect(r.success).toBe(true);

    const [mr] = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    expect(mr.status).toBe('admin_set');
    expect(mr.team_a_score).toBe(21);
    expect(mr.team_b_score).toBe(18);

    // Ledger: 4 rows present (winners + losers)
    const ledger = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(ledger.length).toBe(4);

    // Snapshot for gold tier marked stale.
    const snaps = await db
      .select()
      .from(leaderboard_snapshots)
      .where(eq(leaderboard_snapshots.tier, 'gold'));
    expect(snaps.length).toBe(1);
    expect(snaps[0].stale).toBe(true);

    // All 4 participants get score_overridden.
    const overrideNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'score_overridden'));
    expect(overrideNotifs.map((n) => n.user_id).sort()).toEqual(
      [...userIds].sort(),
    );
  });

  it('admin who is also a participant returns CONFLICT_OF_INTEREST', async () => {
    const { matchId, clerkIds } = await seedTournamentWithAdmin();
    await submitScore(
      { match_id: matchId, team_a_score: 10, team_b_score: 21 },
      clerkIds[0],
    );

    // clerkIds[0] is both club admin AND a participant.
    const r = await adminOverrideMatch(
      { match_id: matchId, team_a_score: 21, team_b_score: 12 },
      clerkIds[0],
    );
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('CONFLICT_OF_INTEREST');

    const [mr] = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    expect(mr.status).toBe('pending');
    expect(mr.team_a_score).toBe(10);
  });

  it('non-admin user returns FORBIDDEN', async () => {
    const { matchId, clerkIds } = await seedTournamentWithAdmin();
    await submitScore(
      { match_id: matchId, team_a_score: 10, team_b_score: 21 },
      clerkIds[0],
    );

    // clerkIds[1] is a participant but NOT a club admin.
    const r = await adminOverrideMatch(
      { match_id: matchId, team_a_score: 21, team_b_score: 5 },
      clerkIds[1],
    );
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('FORBIDDEN');
  });

  it('admin can override even when no submission exists yet', async () => {
    const { matchId, outsideAdminClerk } = await seedTournamentWithAdmin();
    // No submitScore called.

    const r = await adminOverrideMatch(
      { match_id: matchId, team_a_score: 21, team_b_score: 14 },
      outsideAdminClerk,
    );
    expect(r.success).toBe(true);

    const [mr] = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    expect(mr.status).toBe('admin_set');
    expect(mr.team_a_score).toBe(21);

    const ledger = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(ledger.length).toBe(4);
  });

  it('second admin override after admin_set returns ALREADY_OVERRIDDEN', async () => {
    const { matchId, outsideAdminClerk } = await seedTournamentWithAdmin();
    const stamp = uuidv7().slice(0, 8);

    // Set up a second club admin.
    const secondAdminClerk = `adm-second-${stamp}`;
    const [u2] = await db
      .insert(users)
      .values({ clerk_id: secondAdminClerk, email: `${secondAdminClerk}@x` })
      .returning();
    const [mRow] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);
    const [tRow] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, mRow.tournament_id))
      .limit(1);
    await db
      .insert(club_memberships)
      .values({ user_id: u2.id, club_id: tRow.club_id, role: 'admin' });

    const first = await adminOverrideMatch(
      { match_id: matchId, team_a_score: 21, team_b_score: 12 },
      outsideAdminClerk,
    );
    expect(first.success).toBe(true);

    const second = await adminOverrideMatch(
      { match_id: matchId, team_a_score: 21, team_b_score: 5 },
      secondAdminClerk,
    );
    expect(second.success).toBe(false);
    if (second.success) return;
    expect(second.error.code).toBe('ALREADY_OVERRIDDEN');

    // First override sticks.
    const [mr] = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    expect(mr.team_b_score).toBe(12);
  });
});

// ── adminVoidMatch ──────────────────────────────────────────────────────────

describe('adminVoidMatch', () => {
  it('voids both match and result, deletes ledger, notifies participants with void=true', async () => {
    const { matchId, clerkIds, userIds, outsideAdminClerk, playerIds } =
      await seedTournamentWithAdmin();
    await submitScore(
      { match_id: matchId, team_a_score: 21, team_b_score: 19 },
      clerkIds[0],
    );
    // Confirm so ledger has rows to delete.
    const conf = await import('@/features/scoring/actions').then((m) =>
      m.confirmScore({ match_id: matchId }, clerkIds[2]),
    );
    expect(conf.success).toBe(true);

    const ledgerBefore = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(ledgerBefore.length).toBe(4);

    // Pre-seed a snapshot for one of the participants to verify stale flip.
    await db.insert(leaderboard_snapshots).values({
      period: 'week',
      period_start: '2026-05-18',
      tier: 'gold',
      player_id: playerIds[0],
      rank: 1,
      points_sum: '50.00',
      match_count: 1,
      stale: false,
    });

    const r = await adminVoidMatch({ match_id: matchId }, outsideAdminClerk);
    expect(r.success).toBe(true);

    const [mr] = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    expect(mr.status).toBe('void');

    const [m] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));
    expect(m.status).toBe('void');

    const ledgerAfter = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(ledgerAfter.length).toBe(0);

    const snaps = await db
      .select()
      .from(leaderboard_snapshots)
      .where(eq(leaderboard_snapshots.tier, 'gold'));
    expect(snaps[0].stale).toBe(true);

    const voidNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'score_overridden'));
    expect(voidNotifs.map((n) => n.user_id).sort()).toEqual(
      [...userIds].sort(),
    );
    // Payload signals it was a void.
    expect(voidNotifs[0].payload).toMatchObject({ void: true });
  });

  it('participant admin returns CONFLICT_OF_INTEREST', async () => {
    const { matchId, clerkIds } = await seedTournamentWithAdmin();
    await submitScore(
      { match_id: matchId, team_a_score: 21, team_b_score: 19 },
      clerkIds[0],
    );

    const r = await adminVoidMatch({ match_id: matchId }, clerkIds[0]);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('CONFLICT_OF_INTEREST');
  });

  it('non-admin returns FORBIDDEN', async () => {
    const { matchId, clerkIds } = await seedTournamentWithAdmin();
    await submitScore(
      { match_id: matchId, team_a_score: 21, team_b_score: 19 },
      clerkIds[0],
    );

    const r = await adminVoidMatch({ match_id: matchId }, clerkIds[1]);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('FORBIDDEN');
  });
});
