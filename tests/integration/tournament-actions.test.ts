import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
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
  publishTournament,
  registerForTournament,
  updateTournament,
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

describe('publishTournament', () => {
  it('club admin transitions draft → open', async () => {
    const clerkId = `c-pub-${uuidv7().slice(0, 8)}`;
    const [u] = await db
      .insert(users)
      .values({ clerk_id: clerkId, email: `${clerkId}@x` })
      .returning();
    const [c] = await db
      .insert(clubs)
      .values({ slug: `pub-${clerkId.slice(-8)}`, name: 'Pub Test' })
      .returning();
    await db
      .insert(club_memberships)
      .values({ user_id: u.id, club_id: c.id, role: 'admin' });

    const created = await createTournament(
      {
        club_id: c.id,
        name: 'Sat Open',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );
    if (!created.success) throw new Error('setup failed');

    const r = await publishTournament(
      { tournament_id: created.data.tournament_id },
      clerkId,
    );

    expect(r.success).toBe(true);

    const [t] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, created.data.tournament_id));
    expect(t.status).toBe('open');
  });

  it('returns INVALID_STATUS when called on a tournament not in draft', async () => {
    // Setup an "open" tournament and try to publish it again
    const clerkId = `c-pub2-${uuidv7().slice(0, 8)}`;
    const [u] = await db
      .insert(users)
      .values({ clerk_id: clerkId, email: `${clerkId}@x` })
      .returning();
    const [c] = await db
      .insert(clubs)
      .values({ slug: `pub2-${clerkId.slice(-8)}`, name: 'Pub2 Test' })
      .returning();
    await db
      .insert(club_memberships)
      .values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const [t] = await db
      .insert(tournaments)
      .values({
        slug: `already-open-${clerkId.slice(-8)}`,
        club_id: c.id,
        name: 'Already Open',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000),
        status: 'open',
        created_by: u.id,
      })
      .returning();

    const r = await publishTournament({ tournament_id: t.id }, clerkId);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('INVALID_STATUS');
  });

  it('returns FORBIDDEN for non-admin caller', async () => {
    const adminClerkId = `c-pub3a-${uuidv7().slice(0, 8)}`;
    const otherClerkId = `c-pub3b-${uuidv7().slice(0, 8)}`;
    const [admin] = await db
      .insert(users)
      .values({ clerk_id: adminClerkId, email: `${adminClerkId}@x` })
      .returning();
    await db
      .insert(users)
      .values({ clerk_id: otherClerkId, email: `${otherClerkId}@x` });
    const [c] = await db
      .insert(clubs)
      .values({ slug: `pub3-${otherClerkId.slice(-8)}`, name: 'Pub3 Test' })
      .returning();
    await db
      .insert(club_memberships)
      .values({ user_id: admin.id, club_id: c.id, role: 'admin' });
    const [t] = await db
      .insert(tournaments)
      .values({
        slug: `t-pub3-${otherClerkId.slice(-8)}`,
        club_id: c.id,
        name: 'Draft Tournament',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000),
        status: 'draft',
        created_by: admin.id,
      })
      .returning();

    const r = await publishTournament({ tournament_id: t.id }, otherClerkId);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('FORBIDDEN');
  });
});

describe('updateTournament', () => {
  it('club admin can edit name + start_at when status is draft or open and no matches exist', async () => {
    // Create draft tournament via createTournament
    const clerkId = `c-upd-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [c] = await db.insert(clubs).values({ slug: `upd-${clerkId.slice(-8)}`, name: 'Upd' }).returning();
    await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const created = await createTournament(
      {
        club_id: c.id,
        name: 'Original',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );
    if (!created.success) throw new Error('setup');

    const newStart = new Date(Date.now() + 172_800_000).toISOString();
    const r = await updateTournament(
      {
        tournament_id: created.data.tournament_id,
        name: 'Renamed',
        format: 'americano',
        tournament_type: 'open',
        start_at: newStart,
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );

    expect(r.success).toBe(true);
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, created.data.tournament_id));
    expect(t.name).toBe('Renamed');
    expect(t.format).toBe('americano');
  });

  it('returns INVALID_STATUS when tournament is in_progress', async () => {
    // Setup tournament with status=in_progress
    const clerkId = `c-upd2-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [c] = await db.insert(clubs).values({ slug: `upd2-${clerkId.slice(-8)}`, name: 'Upd2' }).returning();
    await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const [t] = await db.insert(tournaments).values({
      slug: `t-upd2-${clerkId.slice(-8)}`,
      club_id: c.id,
      name: 'Locked',
      format: 'round_robin',
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 86_400_000),
      status: 'in_progress',
      created_by: u.id,
    }).returning();

    const r = await updateTournament(
      {
        tournament_id: t.id,
        name: 'Try Rename',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );

    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('INVALID_STATUS');
  });

  it('returns INVALID_STATUS when tournament has matches', async () => {
    const clerkId = `c-upd3-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [c] = await db.insert(clubs).values({ slug: `upd3-${clerkId.slice(-8)}`, name: 'Upd3' }).returning();
    await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const [t] = await db.insert(tournaments).values({
      slug: `t-upd3-${clerkId.slice(-8)}`,
      club_id: c.id,
      name: 'Has Matches',
      format: 'round_robin',
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 86_400_000),
      status: 'open',
      created_by: u.id,
    }).returning();
    const [p1] = await db.insert(players).values({ user_id: u.id, handle: `p1-${clerkId.slice(-8)}`, display_name: 'P1', tier: 'bronze' }).returning();
    await db.insert(matches).values({
      tournament_id: t.id,
      team_a: [p1.id],
      team_b: [p1.id],
      status: 'scheduled',
    });

    const r = await updateTournament(
      {
        tournament_id: t.id,
        name: 'Rename Anyway',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );

    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('INVALID_STATUS');
  });

  it('returns FORBIDDEN for non-admin', async () => {
    const adminClerkId = `c-upd4a-${uuidv7().slice(0, 8)}`;
    const otherClerkId = `c-upd4b-${uuidv7().slice(0, 8)}`;
    const [admin] = await db
      .insert(users)
      .values({ clerk_id: adminClerkId, email: `${adminClerkId}@x` })
      .returning();
    await db
      .insert(users)
      .values({ clerk_id: otherClerkId, email: `${otherClerkId}@x` });
    const [c] = await db
      .insert(clubs)
      .values({ slug: `upd4-${otherClerkId.slice(-8)}`, name: 'Upd4' })
      .returning();
    await db
      .insert(club_memberships)
      .values({ user_id: admin.id, club_id: c.id, role: 'admin' });
    const [t] = await db
      .insert(tournaments)
      .values({
        slug: `t-upd4-${otherClerkId.slice(-8)}`,
        club_id: c.id,
        name: 'Draft',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000),
        status: 'draft',
        created_by: admin.id,
      })
      .returning();

    const r = await updateTournament(
      {
        tournament_id: t.id,
        name: 'Attempt',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      otherClerkId,
    );

    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('FORBIDDEN');
  });

  it('returns VALIDATION when tier_min > tier_max', async () => {
    const clerkId = `c-upd5-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [c] = await db.insert(clubs).values({ slug: `upd5-${clerkId.slice(-8)}`, name: 'Upd5' }).returning();
    await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const created = await createTournament(
      {
        club_id: c.id,
        name: 'Tier Test',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );
    if (!created.success) throw new Error('setup');

    const r = await updateTournament(
      {
        tournament_id: created.data.tournament_id,
        name: 'Tier Test',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: 'gold',
        tier_max: 'silver',
      },
      clerkId,
    );

    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('VALIDATION');
  });
});
