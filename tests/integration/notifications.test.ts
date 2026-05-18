import { describe, expect, it } from 'vitest';
import { db } from '@/libs/DB';
import { users, notifications } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { createNotification } from '@/features/notifications/actions';

describe('createNotification', () => {
  it('inserts one row per user_id', async () => {
    const [u1] = await db.insert(users).values({ clerk_id: 'n1', email: 'n1@x' }).returning();
    const [u2] = await db.insert(users).values({ clerk_id: 'n2', email: 'n2@x' }).returning();
    const r = await createNotification({
      user_ids: [u1.id, u2.id],
      type: 'score_confirmed',
      payload: { match_id: 'abc' },
    });
    expect(r.success).toBe(true);

    const rows = await db.select().from(notifications).where(eq(notifications.type, 'score_confirmed'));
    expect(rows.length).toBe(2);
  });
});
