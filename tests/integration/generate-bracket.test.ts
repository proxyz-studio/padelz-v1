import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  brackets,
  club_memberships,
  clubs,
  matches,
  players,
  registrations,
  tournaments,
  users,
} from '@/models/Schema';
import {
  createTournament,
  generateBracket,
  publishTournament,
} from '@/features/tournaments/actions';

// ── Fixture helpers ───────────────────────────────────────────────────────────

async function makeClubAdmin(suffix: string) {
  const clerkId = `gb-admin-${suffix}`;
  const [u] = await db
    .insert(users)
    .values({ clerk_id: clerkId, email: `${clerkId}@x` })
    .returning();
  const [c] = await db
    .insert(clubs)
    .values({ slug: `gb-club-${suffix}`, name: `GB Club ${suffix}` })
    .returning();
  await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });
  return { clerkId, userId: u.id, clubId: c.id };
}

async function makeTournament(
  clubId: string,
  adminClerkId: string,
  format: 'americano' | 'mexicano' | 'round_robin' | 'bracket',
) {
  const r = await createTournament(
    {
      club_id: clubId,
      name: `GB Tourney ${format}`,
      format,
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 86_400_000).toISOString(),
      tier_min: null,
      tier_max: null,
    },
    adminClerkId,
  );
  if (!r.success) throw new Error(`createTournament failed: ${r.error.message}`);
  return r.data.tournament_id;
}

/** Create n players with unique clerk ids. No home_club_id (optional field). */
async function makePlayers(n: number): Promise<string[]> {
  const playerIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const suffix = uuidv7().replace(/-/g, '').slice(0, 12);
    const [u] = await db
      .insert(users)
      .values({ clerk_id: `gb-p-${suffix}`, email: `gb-p-${suffix}@x` })
      .returning();
    const [p] = await db
      .insert(players)
      .values({
        user_id: u.id,
        handle: `gbp-${suffix}`,
        display_name: `GB Player ${i}`,
        tier: 'bronze',
      })
      .returning();
    playerIds.push(p.id);
  }
  return playerIds;
}

async function registerPlayers(tournamentId: string, playerIds: string[]) {
  for (const pid of playerIds) {
    await db.insert(registrations).values({
      tournament_id: tournamentId,
      player_id: pid,
      status: 'registered',
    });
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateBracket Server Action', () => {
  it('americano: inserts bracket row + matches atomically for 4 players', async () => {
    const { clerkId, clubId } = await makeClubAdmin(uuidv7().replace(/-/g, '').slice(0, 12));
    const tId = await makeTournament(clubId, clerkId, 'americano');
    const pub = await publishTournament({ tournament_id: tId }, clerkId);
    expect(pub.success).toBe(true);
    const pIds = await makePlayers(4);
    await registerPlayers(tId, pIds);

    const result = await generateBracket({ tournament_id: tId }, clerkId);

    expect(result.success).toBe(true);
    if (!result.success) return;

    // bracket row exists
    const bracketRows = await db
      .select()
      .from(brackets)
      .where(eq(brackets.tournament_id, tId));
    expect(bracketRows.length).toBe(1);
    expect(bracketRows[0].data).toBeTruthy();

    // matches rows: 4-player americano = 3 rounds × 1 match = 3 matches
    const matchRows = await db
      .select()
      .from(matches)
      .where(eq(matches.tournament_id, tId));
    expect(matchRows.length).toBe(3);

    // every match is 2v2
    for (const m of matchRows) {
      expect(m.team_a.length).toBe(2);
      expect(m.team_b.length).toBe(2);
    }
  });

  it('round_robin: inserts 6 matches for 4 players', async () => {
    const { clerkId, clubId } = await makeClubAdmin(uuidv7().replace(/-/g, '').slice(0, 12));
    const tId = await makeTournament(clubId, clerkId, 'round_robin');
    const pub = await publishTournament({ tournament_id: tId }, clerkId);
    expect(pub.success).toBe(true);
    const pIds = await makePlayers(4);
    await registerPlayers(tId, pIds);

    const result = await generateBracket({ tournament_id: tId }, clerkId);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const matchRows = await db
      .select()
      .from(matches)
      .where(eq(matches.tournament_id, tId));
    expect(matchRows.length).toBe(6);
  });

  it('bracket: inserts 3 matches for 4 players (single-elim)', async () => {
    const { clerkId, clubId } = await makeClubAdmin(uuidv7().replace(/-/g, '').slice(0, 12));
    const tId = await makeTournament(clubId, clerkId, 'bracket');
    const pub = await publishTournament({ tournament_id: tId }, clerkId);
    expect(pub.success).toBe(true);
    const pIds = await makePlayers(4);
    await registerPlayers(tId, pIds);

    const result = await generateBracket({ tournament_id: tId }, clerkId);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const matchRows = await db
      .select()
      .from(matches)
      .where(eq(matches.tournament_id, tId));
    expect(matchRows.length).toBe(3);
  });

  it('mexicano: inserts 1 initial round (1 match) for 4 players', async () => {
    const { clerkId, clubId } = await makeClubAdmin(uuidv7().replace(/-/g, '').slice(0, 12));
    const tId = await makeTournament(clubId, clerkId, 'mexicano');
    const pub = await publishTournament({ tournament_id: tId }, clerkId);
    expect(pub.success).toBe(true);
    const pIds = await makePlayers(4);
    await registerPlayers(tId, pIds);

    const result = await generateBracket({ tournament_id: tId }, clerkId);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const matchRows = await db
      .select()
      .from(matches)
      .where(eq(matches.tournament_id, tId));
    expect(matchRows.length).toBe(1);
  });

  it('returns UNAUTHORIZED when caller has no synced user row', async () => {
    // Pass a clerkUserId that does not exist in the `users` table.
    // generateBracket resolves userId but then fails to find the user row → UNAUTHORIZED.
    const result = await generateBracket(
      { tournament_id: '00000000-0000-0000-0000-000000000001' },
      'no-such-clerk-id',
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('returns FORBIDDEN when caller is not admin of tournament club', async () => {
    const { clerkId: adminClerkId, clubId } = await makeClubAdmin(uuidv7().replace(/-/g, '').slice(0, 12));
    const tId = await makeTournament(clubId, adminClerkId, 'americano');
    const pIds = await makePlayers(4);
    await registerPlayers(tId, pIds);

    // Create a non-admin user (no club_membership row)
    const suffix = uuidv7().replace(/-/g, '').slice(0, 12);
    const nonAdminClerk = `gb-nonadmin-${suffix}`;
    await db.insert(users).values({ clerk_id: nonAdminClerk, email: `${nonAdminClerk}@x` });

    const result = await generateBracket({ tournament_id: tId }, nonAdminClerk);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('idempotent guard — second call returns ALREADY_GENERATED', async () => {
    const { clerkId, clubId } = await makeClubAdmin(uuidv7().replace(/-/g, '').slice(0, 12));
    const tId = await makeTournament(clubId, clerkId, 'americano');
    const pub = await publishTournament({ tournament_id: tId }, clerkId);
    expect(pub.success).toBe(true);
    const pIds = await makePlayers(4);
    await registerPlayers(tId, pIds);

    const first = await generateBracket({ tournament_id: tId }, clerkId);
    expect(first.success).toBe(true);

    const second = await generateBracket({ tournament_id: tId }, clerkId);
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.code).toBe('ALREADY_GENERATED');
  });
});

describe('generateBracket status guards', () => {
  it('returns INVALID_STATUS when tournament is in draft', async () => {
    const { clerkId, clubId } = await makeClubAdmin(uuidv7().slice(0, 8));
    const tournamentId = await makeTournament(clubId, clerkId, 'round_robin');
    const playerIds = await makePlayers(4);
    for (const pid of playerIds) {
      await db.insert(registrations).values({
        tournament_id: tournamentId,
        player_id: pid,
        status: 'registered',
      });
    }
    const r = await generateBracket({ tournament_id: tournamentId }, clerkId);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('INVALID_STATUS');
  });

  it('flips status from open to in_progress on successful generate', async () => {
    const { clerkId, clubId } = await makeClubAdmin(uuidv7().slice(0, 8));
    const tournamentId = await makeTournament(clubId, clerkId, 'round_robin');
    const pub = await publishTournament({ tournament_id: tournamentId }, clerkId);
    expect(pub.success).toBe(true);
    const playerIds = await makePlayers(4);
    for (const pid of playerIds) {
      await db.insert(registrations).values({
        tournament_id: tournamentId,
        player_id: pid,
        status: 'registered',
      });
    }
    const r = await generateBracket({ tournament_id: tournamentId }, clerkId);
    expect(r.success).toBe(true);
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
    expect(t.status).toBe('in_progress');
    const [br] = await db.select().from(brackets).where(eq(brackets.tournament_id, tournamentId));
    expect(br).toBeDefined();
    const ms = await db.select().from(matches).where(eq(matches.tournament_id, tournamentId));
    expect(ms.length).toBeGreaterThan(0);
  });
});
