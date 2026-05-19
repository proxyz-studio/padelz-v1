import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { db } from '@/libs/DB';
import {
  ForbiddenError,
  assertClubAdmin,
  assertPlayerOwner,
} from '@/libs/Authz';
import { club_memberships, clubs, players, users } from '@/models/Schema';

describe('Authz', () => {
  it('assertPlayerOwner allows the owner, rejects everyone else', async () => {
    const ownerId = uuidv7();
    const strangerId = uuidv7();
    await db.insert(users).values([
      { id: ownerId, clerk_id: `c-owner-${ownerId}`, email: `owner-${ownerId}@x` },
      {
        id: strangerId,
        clerk_id: `c-stranger-${strangerId}`,
        email: `stranger-${strangerId}@x`,
      },
    ]);
    const [p] = await db
      .insert(players)
      .values({
        user_id: ownerId,
        handle: `authz-owner-${ownerId.slice(0, 8)}`,
        display_name: 'Owner',
        tier: 'bronze',
      })
      .returning();

    await expect(assertPlayerOwner(ownerId, p.id)).resolves.toBeUndefined();
    await expect(assertPlayerOwner(strangerId, p.id)).rejects.toThrow(
      ForbiddenError,
    );
    // unknown player id also forbidden
    await expect(assertPlayerOwner(ownerId, uuidv7())).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('assertClubAdmin allows admins, rejects members and outsiders', async () => {
    const adminId = uuidv7();
    const memberId = uuidv7();
    const outsiderId = uuidv7();
    await db.insert(users).values([
      { id: adminId, clerk_id: `c-admin-${adminId}`, email: `admin-${adminId}@x` },
      {
        id: memberId,
        clerk_id: `c-member-${memberId}`,
        email: `member-${memberId}@x`,
      },
      {
        id: outsiderId,
        clerk_id: `c-out-${outsiderId}`,
        email: `out-${outsiderId}@x`,
      },
    ]);
    const [c] = await db
      .insert(clubs)
      .values({
        slug: `authz-club-${adminId.slice(0, 8)}`,
        name: 'Authz Club',
        court_count: 1,
      })
      .returning();
    await db.insert(club_memberships).values([
      { user_id: adminId, club_id: c.id, role: 'admin' },
      { user_id: memberId, club_id: c.id, role: 'member' },
    ]);

    await expect(assertClubAdmin(adminId, c.id)).resolves.toBeUndefined();
    await expect(assertClubAdmin(memberId, c.id)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(assertClubAdmin(outsiderId, c.id)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('ForbiddenError carries the FORBIDDEN code and a descriptive message', () => {
    const e = new ForbiddenError('not allowed');
    expect(e.code).toBe('FORBIDDEN');
    expect(e.message).toBe('not allowed');
    expect(e.name).toBe('ForbiddenError');
    expect(e).toBeInstanceOf(Error);
  });
});
