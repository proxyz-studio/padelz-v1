import { describe, expect, it } from 'vitest';
import { db } from '@/libs/DB';
import { users, players } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { handleClerkEvent } from '@/features/auth/webhook';

describe('Clerk webhook', () => {
  it('creates a users row + auto-creates players row on user.created', async () => {
    const clerkId = 'user_test_' + Date.now();
    await handleClerkEvent({
      type: 'user.created',
      data: { id: clerkId, email_addresses: [{ email_address: 'a@b.com' }] },
    } as any);

    const u = await db.select().from(users).where(eq(users.clerk_id, clerkId));
    expect(u.length).toBe(1);

    const p = await db.select().from(players).where(eq(players.user_id, u[0].id));
    expect(p.length).toBe(1);
    expect(p[0].handle).toMatch(/^[a-z0-9-]{8,}$/);
    expect(p[0].tier).toBe('bronze');
  });

  it('soft-deletes player on user.deleted (redact, not destroy)', async () => {
    const clerkId = 'user_del_' + Date.now();
    await handleClerkEvent({
      type: 'user.created',
      data: { id: clerkId, email_addresses: [{ email_address: 'd@b.com' }] },
    } as any);

    await handleClerkEvent({ type: 'user.deleted', data: { id: clerkId } } as any);

    const u = await db.select().from(users).where(eq(users.clerk_id, clerkId));
    const p = await db.select().from(players).where(eq(players.user_id, u[0].id));
    expect(p[0].redacted_at).not.toBeNull();
    expect(p[0].display_name).toBe('[deleted]');
    expect(p[0].photo_url).toBeNull();
  });
});
