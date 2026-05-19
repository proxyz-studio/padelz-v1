/**
 * Authz — single source of truth for ownership / authorization checks.
 *
 * Follows the SMB Web-Service/05-Security A01 mitigation: server-side ownership
 * checks on every read and write. M2/M3/M4 Server Actions call these helpers
 * before mutating shared resources.
 *
 * On forbidden access, throws `ForbiddenError` which callers should catch and
 * translate to a 403 response or `Result<T>` with code `FORBIDDEN`.
 */

import { and, eq } from 'drizzle-orm';
import { db } from './DB';
import { Env } from './Env';
import {
  club_memberships,
  players,
  users,
} from '@/models/Schema';

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN' as const;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Throws if `userId` is not the owner of the given player record (i.e.,
 * `players.user_id !== userId`).
 *
 * Used by: profile edit, photo upload, redact-self.
 */
export async function assertPlayerOwner(
  userId: string,
  playerId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.user_id, userId)))
    .limit(1);
  if (!row) {
    throw new ForbiddenError('not the owner of this player');
  }
}

/**
 * Throws if `userId` is not a club admin (i.e., there is no
 * `club_memberships` row with role='admin' linking them).
 *
 * Used by: tournament create, bracket edit, club settings, admin overrides.
 */
export async function assertClubAdmin(
  userId: string,
  clubId: string,
): Promise<void> {
  const [row] = await db
    .select({ role: club_memberships.role })
    .from(club_memberships)
    .where(
      and(
        eq(club_memberships.user_id, userId),
        eq(club_memberships.club_id, clubId),
      ),
    )
    .limit(1);
  if (!row || row.role !== 'admin') {
    throw new ForbiddenError('not a club admin');
  }
}

/**
 * Throws if `userId` is not on the platform admin allowlist. The allowlist
 * lives in the `PLATFORM_ADMIN_EMAILS` env var (comma-separated). If unset,
 * no one is a platform admin.
 *
 * Used by: voided scores, manual tier overrides, support actions.
 */
export async function assertPlatformAdmin(userId: string): Promise<void> {
  const allowlist = (Env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) {
    throw new ForbiddenError('no platform admins configured');
  }
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row || !allowlist.includes(row.email)) {
    throw new ForbiddenError('not a platform admin');
  }
}
