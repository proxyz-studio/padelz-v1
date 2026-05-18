import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { clubs } from '@/models/Schema';
import { uuidv7 } from 'uuidv7';

describe('db.transaction', () => {
  it('commits all rows when transaction succeeds', async () => {
    const clubId = uuidv7();
    await db.transaction(async (tx) => {
      await tx.insert(clubs).values({
        id: clubId,
        slug: `txn-test-${Date.now()}`,
        name: 'Txn Test Club',
        court_count: 1,
      });
    });
    const rows = await db.select().from(clubs).where(eq(clubs.id, clubId));
    expect(rows.length).toBe(1);
  });

  it('rolls back all rows when transaction throws', async () => {
    const clubId = uuidv7();
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(clubs).values({
          id: clubId,
          slug: `txn-rollback-${Date.now()}`,
          name: 'Txn Rollback Club',
          court_count: 1,
        });
        throw new Error('intentional rollback');
      }),
    ).rejects.toThrow('intentional rollback');
    const rows = await db.select().from(clubs).where(eq(clubs.id, clubId));
    expect(rows.length).toBe(0);
  });
});
