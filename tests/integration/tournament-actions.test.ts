import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  club_memberships,
  clubs,
  players,
  registrations,
  tournaments,
  users,
} from '@/models/Schema';
import {
  createTournament,
  registerForTournament,
} from '@/features/tournaments/actions';

describe('createTournament', () => {
  it('club admin can create a tournament at their own club', async () => {
    const clerkId = `c-create-${uuidv7().slice(0, 8)}`;
    const [u] = await db
      .insert(users)
      .values({ clerk_id: clerkId, email: `${clerkId}@x` })
      .returning();
    const [c] = await db
      .insert(clubs)
      .values({ slug: `ct-${clerkId.slice(-8)}`, name: 'Create Test Club' })
      .returning();
    await db
      .insert(club_memberships)
      .values({ user_id: u.id, club_id: c.id, role: 'admin' });

    const r = await createTournament(
      {
        club_id: c.id,
        name: 'Sat Open Test',
        format: 'americano',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );

    expect(r.success).toBe(true);
    if (!r.success) return;

    const [t] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, r.data.tournament_id));
    expect(t.name).toBe('Sat Open Test');
    expect(t.status).toBe('draft');
    expect(t.club_id).toBe(c.id);
    expect(t.slug.startsWith('sat-open-test-')).toBe(true);
  });

  it('non-admin returns FORBIDDEN', async () => {
    const clerkId = `c-non-admin-${uuidv7().slice(0, 8)}`;
    const [u] = await db
      .insert(users)
      .values({ clerk_id: clerkId, email: `${clerkId}@x` })
      .returning();
    const [c] = await db
      .insert(clubs)
      .values({ slug: `ct2-${clerkId.slice(-8)}`, name: 'Other' })
      .returning();
    // No membership at all

    const r = await createTournament(
      {
        club_id: c.id,
        name: 'Blocked',
        format: 'bracket',
        tournament_type: 'open',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('FORBIDDEN');
    // ensure u is referenced so lint doesn't flag the unused destructure
    expect(u.id).toBeTruthy();
  });

  it('member-role (not admin) returns FORBIDDEN', async () => {
    const clerkId = `c-member-${uuidv7().slice(0, 8)}`;
    const [u] = await db
      .insert(users)
      .values({ clerk_id: clerkId, email: `${clerkId}@x` })
      .returning();
    const [c] = await db
      .insert(clubs)
      .values({ slug: `ct3-${clerkId.slice(-8)}`, name: 'Member Club' })
      .returning();
    await db
      .insert(club_memberships)
      .values({ user_id: u.id, club_id: c.id, role: 'member' });

    const r = await createTournament(
      {
        club_id: c.id,
        name: 'Member Blocked',
        format: 'americano',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('FORBIDDEN');
  });

  it('rejects tier_min > tier_max via VALIDATION', async () => {
    const clerkId = `c-tier-bad-${uuidv7().slice(0, 8)}`;
    const [u] = await db
      .insert(users)
      .values({ clerk_id: clerkId, email: `${clerkId}@x` })
      .returning();
    const [c] = await db
      .insert(clubs)
      .values({ slug: `ct4-${clerkId.slice(-8)}`, name: 'Tier Club' })
      .returning();
    await db
      .insert(club_memberships)
      .values({ user_id: u.id, club_id: c.id, role: 'admin' });

    const r = await createTournament(
      {
        club_id: c.id,
        name: 'Bad Tiers',
        format: 'bracket',
        tournament_type: 'open',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: 'gold',
        tier_max: 'silver',
      },
      clerkId,
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('VALIDATION');
  });
});

describe('registerForTournament', () => {
  async function setup(playerTier: 'bronze' | 'silver' | 'gold' | 'platinum') {
    const clerkId = `c-reg-${uuidv7().slice(0, 8)}`;
    const [u] = await db
      .insert(users)
      .values({ clerk_id: clerkId, email: `${clerkId}@x` })
      .returning();
    const [c] = await db
      .insert(clubs)
      .values({ slug: `rc-${clerkId.slice(-8)}`, name: 'Reg Club' })
      .returning();
    await db.insert(players).values({
      user_id: u.id,
      handle: `reg-${clerkId.slice(-8)}`,
      display_name: `Reg ${playerTier}`,
      tier: playerTier,
    });
    return { clerkId, userId: u.id, clubId: c.id };
  }

  async function makeTournament(
    clubId: string,
    creatorClerkId: string,
    tierMin: 'bronze' | 'silver' | 'gold' | 'platinum' | null = null,
    tierMax: 'bronze' | 'silver' | 'gold' | 'platinum' | null = null,
  ) {
    // bootstrap admin in the club so createTournament passes the gate
    const [creator] = await db
      .select()
      .from(users)
      .where(eq(users.clerk_id, creatorClerkId))
      .limit(1);
    await db
      .insert(club_memberships)
      .values({ user_id: creator.id, club_id: clubId, role: 'admin' });

    const r = await createTournament(
      {
        club_id: clubId,
        name: 'Open Tournament',
        format: 'americano',
        tournament_type: 'open',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: tierMin,
        tier_max: tierMax,
      },
      creatorClerkId,
    );
    if (!r.success) throw new Error(`createTournament failed: ${r.error.message}`);
    return r.data.tournament_id;
  }

  it('signed-in player registers when there is no tier restriction', async () => {
    const { clerkId, clubId } = await setup('bronze');
    const tournamentId = await makeTournament(clubId, clerkId);

    const r = await registerForTournament({ tournament_id: tournamentId }, clerkId);
    expect(r.success).toBe(true);
    if (!r.success) return;

    const rows = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, r.data.registration_id));
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('registered');
  });

  it('blocks bronze player from a gold+ tournament with TIER_TOO_LOW', async () => {
    const { clerkId, clubId } = await setup('bronze');
    const tournamentId = await makeTournament(clubId, clerkId, 'gold', null);

    const r = await registerForTournament({ tournament_id: tournamentId }, clerkId);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('TIER_TOO_LOW');
  });

  it('blocks diamond player from a bronze-only tournament with TIER_TOO_HIGH', async () => {
    const { clerkId, clubId } = await setup('platinum');
    const tournamentId = await makeTournament(clubId, clerkId, null, 'silver');

    const r = await registerForTournament({ tournament_id: tournamentId }, clerkId);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('TIER_TOO_HIGH');
  });

  it('idempotent — second registration returns ALREADY_REGISTERED', async () => {
    const { clerkId, clubId } = await setup('silver');
    const tournamentId = await makeTournament(clubId, clerkId);

    const first = await registerForTournament({ tournament_id: tournamentId }, clerkId);
    expect(first.success).toBe(true);

    const second = await registerForTournament({ tournament_id: tournamentId }, clerkId);
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.code).toBe('ALREADY_REGISTERED');
  });
});
