'use server';
import { z } from 'zod';
import { db } from '@/libs/DB';
import { notifications } from '@/models/Schema';
import type { Result } from '@/features/scoring/types';
import type { CreateNotificationInput } from './types';

const Schema = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(500),
  type: z.enum([
    'score_pending', 'score_confirmed', 'score_disputed',
    'pending_expired', 'score_overridden', 'tier_promoted', 'registration_confirmed',
  ]),
  payload: z.record(z.unknown()),
});

export async function createNotification(input: CreateNotificationInput): Promise<Result<{ inserted: number }>> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION', message: parsed.error.message } };
  }
  const rows = parsed.data.user_ids.map((user_id) => ({
    user_id,
    type: parsed.data.type,
    payload: parsed.data.payload,
  }));
  await db.insert(notifications).values(rows);
  return { success: true, data: { inserted: rows.length } };
}
