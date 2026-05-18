import { describe, expect, it } from 'vitest';
import { db } from '@/libs/DB';
import { users, players, tier_history, notifications } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { promotePlayer } from '@/features/profiles/actions';

describe('promotePlayer', () => {
  it('updates players.tier, opens new tier_history row, fires notification — all atomically', async () => {
    const [u] = await db.insert(users).values({ clerk_id: 'p1', email: 'p1@x' }).returning();
    const [p] = await db.insert(players).values({
      user_id: u.id, handle: 'p1-h', display_name: 'P1', tier: 'silver',
    }).returning();
    await db.insert(tier_history).values({
      player_id: p.id, tier: 'silver', from_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), reason: 'initial',
    });

    const r = await promotePlayer({ player_id: p.id, new_tier: 'gold', reason: 'auto_promote' });
    expect(r.success).toBe(true);

    const updated = await db.select().from(players).where(eq(players.id, p.id));
    expect(updated[0].tier).toBe('gold');

    const history = await db.select().from(tier_history).where(eq(tier_history.player_id, p.id));
    expect(history.length).toBe(2);
    expect(history.find((h) => h.tier === 'silver' && h.to_date !== null)).toBeDefined();
    expect(history.find((h) => h.tier === 'gold' && h.reason === 'auto_promote' && h.to_date === null)).toBeDefined();

    const notifs = await db.select().from(notifications).where(eq(notifications.user_id, u.id));
    expect(notifs.some((n) => n.type === 'tier_promoted')).toBe(true);
  });
});
