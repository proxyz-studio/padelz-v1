import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { db } from '@/libs/DB';
import {
  clubs,
  matches,
  players,
  points_ledger,
  tournaments,
  users,
} from '@/models/Schema';
import { getMyPointsHistory } from '@/features/profiles/actions';

describe('getMyPointsHistory', () => {
  it('returns last N entries ordered by earned_at desc with opponent context', async () => {
    const clerkId = `mp-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [opp] = await db.insert(users).values({ clerk_id: `${clerkId}-opp`, email: `${clerkId}-opp@x` }).returning();

    const [c] = await db.insert(clubs).values({ slug: `mp-club-${clerkId.slice(-8)}`, name: 'MP Club' }).returning();
    const [t] = await db.insert(tournaments).values({
      slug: `mp-t-${clerkId.slice(-8)}`,
      club_id: c.id,
      name: 'MP Test Tournament',
      format: 'round_robin',
      tournament_type: 'club_internal',
      start_at: new Date(),
      status: 'in_progress',
      created_by: u.id,
    }).returning();

    const [pMe] = await db.insert(players).values({ user_id: u.id, handle: `me-${clerkId.slice(-8)}`, display_name: 'Me', tier: 'bronze' }).returning();
    const [pOpp] = await db.insert(players).values({ user_id: opp.id, handle: `opp-${clerkId.slice(-8)}`, display_name: 'Opp', tier: 'bronze' }).returning();

    const [m] = await db.insert(matches).values({
      tournament_id: t.id,
      team_a: [pMe.id],
      team_b: [pOpp.id],
      status: 'complete',
    }).returning();

    await db.insert(points_ledger).values({
      player_id: pMe.id,
      match_id: m.id,
      points: '5',
      breakdown: { base: 5 },
      earned_at: new Date(),
    });

    const r = await getMyPointsHistory(clerkId, 50);
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].points).toBe(5);
    expect(r.entries[0].tournament_name).toBe('MP Test Tournament');
    expect(r.entries[0].opponent_handle).toBe(pOpp.handle);
  });

  it('returns empty array when player has no points entries', async () => {
    const clerkId = `mp2-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    await db.insert(players).values({ user_id: u.id, handle: `me2-${clerkId.slice(-8)}`, display_name: 'Me2', tier: 'bronze' });
    const r = await getMyPointsHistory(clerkId, 50);
    expect(r.entries.length).toBe(0);
  });
});
