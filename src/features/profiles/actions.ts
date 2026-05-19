'use server';
import { z } from 'zod';
import { db } from '@/libs/DB';
import { players, tier_history } from '@/models/Schema';
import { eq, and, isNull } from 'drizzle-orm';
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
