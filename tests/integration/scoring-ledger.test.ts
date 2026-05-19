import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  match_results,
  matches,
  players,
  points_ledger,
  tournaments,
  users,
  clubs,
  club_memberships,
} from '@/models/Schema';
import {
  LedgerError,
  rewriteLedgerForMatch,
  writeLedgerForMatch,
} from '@/features/scoring/ledger';

// Build a complete confirmed match: 4 players, 1 club, 1 tournament, 1 match,
// 1 match_result with status='confirmed'. Returns the match id.
async function seedConfirmedMatch(opts: {
  status?: 'confirmed' | 'admin_set' | 'pending' | 'disputed' | 'void';
  teamAScore?: number;
  teamBScore?: number;
} = {}) {
  const status = opts.status ?? 'confirmed';
  const stamp = uuidv7().slice(0, 8);

  const userIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const [u] = await db
      .insert(users)
      .values({ clerk_id: `ledger-u${i}-${stamp}`, email: `u${i}-${stamp}@x` })
      .returning();
    userIds.push(u.id);
  }

  const tiers = ['gold', 'gold', 'gold', 'gold'] as const;
  const playerIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const [p] = await db
      .insert(players)
      .values({
        user_id: userIds[i],
        handle: `ledger-p${i}-${stamp}`,
        display_name: `Ledger P${i}`,
        tier: tiers[i],
      })
      .returning();
    playerIds.push(p.id);
  }

  const [c] = await db
    .insert(clubs)
    .values({ slug: `lc-${stamp}`, name: 'Ledger Club' })
    .returning();

  await db
    .insert(club_memberships)
    .values({ user_id: userIds[0], club_id: c.id, role: 'admin' });

  const [t] = await db
    .insert(tournaments)
    .values({
      slug: `lt-${stamp}`,
      club_id: c.id,
      name: 'Ledger T',
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
      status: 'complete',
    })
    .returning();

  await db.insert(match_results).values({
    match_id: m.id,
    team_a_score: opts.teamAScore ?? 24,
    team_b_score: opts.teamBScore ?? 21,
    submitted_by: userIds[0],
    confirmed_by: status === 'confirmed' ? userIds[2] : null,
    status,
    confirmed_at: status === 'confirmed' ? new Date() : null,
  });

  return { matchId: m.id, playerIds };
}

describe('writeLedgerForMatch', () => {
  it('inserts one ledger row per player on a confirmed 2v2 match', async () => {
    const { matchId, playerIds } = await seedConfirmedMatch();
    const r = await writeLedgerForMatch(matchId);
    expect(r.inserted).toBe(4);
    expect(r.skipped).toBe(0);

    const rows = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(rows.length).toBe(4);
    expect(rows.map((r) => r.player_id).sort()).toEqual([...playerIds].sort());
    // points stored as numeric → string in Drizzle
    rows.forEach((row) => {
      const pts = Number(row.points);
      expect(pts).toBeGreaterThan(0);
      expect(pts).toBeLessThan(500); // sanity bound
    });
  });

  it('is idempotent — re-running for same match leaves the row count unchanged', async () => {
    const { matchId } = await seedConfirmedMatch();
    const first = await writeLedgerForMatch(matchId);
    expect(first.inserted).toBe(4);

    const second = await writeLedgerForMatch(matchId);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(4);

    const rows = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(rows.length).toBe(4);
  });

  it('rejects when match_result.status is pending', async () => {
    const { matchId } = await seedConfirmedMatch({ status: 'pending' });
    await expect(writeLedgerForMatch(matchId)).rejects.toThrow(LedgerError);
    try {
      await writeLedgerForMatch(matchId);
    } catch (e) {
      if (e instanceof LedgerError) {
        expect(e.code).toBe('WRONG_STATUS');
        expect(e.message).toMatch(/pending/);
      } else {
        throw e;
      }
    }
  });

  it('accepts admin_set status', async () => {
    const { matchId } = await seedConfirmedMatch({ status: 'admin_set' });
    const r = await writeLedgerForMatch(matchId);
    expect(r.inserted).toBe(4);
  });

  it('writes zero rows on a tied result (calculate returns empty awards)', async () => {
    const { matchId } = await seedConfirmedMatch({
      teamAScore: 21,
      teamBScore: 21,
    });
    const r = await writeLedgerForMatch(matchId);
    expect(r.inserted).toBe(0);

    const rows = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(rows.length).toBe(0);
  });
});

describe('rewriteLedgerForMatch', () => {
  it('deletes existing rows then rewrites — used by admin override', async () => {
    const { matchId } = await seedConfirmedMatch();
    await writeLedgerForMatch(matchId);
    const before = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(before.length).toBe(4);

    const r = await rewriteLedgerForMatch(matchId);
    expect(r.inserted).toBe(4);

    const after = await db
      .select()
      .from(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
    expect(after.length).toBe(4);
    // ids should be new (deleted then re-inserted)
    expect(after.map((r) => r.id).sort()).not.toEqual(
      before.map((r) => r.id).sort(),
    );
  });
});
