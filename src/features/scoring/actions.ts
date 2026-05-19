'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/libs/DB';
import { assertClubAdmin, ForbiddenError } from '@/libs/Authz';
import { rateLimit } from '@/libs/RateLimit';
import {
  club_memberships,
  leaderboard_snapshots,
  match_results,
  matches,
  points_ledger,
  players,
  tournaments,
  users,
} from '@/models/Schema';
import { createNotification } from '@/features/notifications/actions';
import { writeLedgerInTx, type Tx } from './ledger';
import type { Result } from './types';

// ── submitScore ──────────────────────────────────────────────────────────────

const SubmitSchema = z.object({
  match_id: z.string().uuid(),
  team_a_score: z.number().int().min(0).max(99),
  team_b_score: z.number().int().min(0).max(99),
});

/**
 * Submit scores for a match. The submitter must be a participant (on either
 * team). Spec §4.7 step 1: first submission wins via DB-level
 * `UNIQUE(match_id)`; the row enters `pending` until the opposing team
 * confirms via `confirmScore`.
 *
 * Rate-limited at 10 submissions per minute per player (spec §5.4).
 *
 * Pass `clerkUserId` explicitly from integration tests; production calls
 * resolve it from Clerk's auth() in middleware.
 */
export async function submitScore(
  input: z.input<typeof SubmitSchema>,
  clerkUserId?: string,
): Promise<Result<{ pending: true }>> {
  const userId = clerkUserId ?? (await auth()).userId;
  if (!userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Sign in required' },
    };
  }

  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION', message: parsed.error.message },
    };
  }

  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.clerk_id, userId))
    .limit(1);
  if (!u) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'User not synced' },
    };
  }

  const [submitter] = await db
    .select()
    .from(players)
    .where(eq(players.user_id, u.id))
    .limit(1);
  if (!submitter) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Player profile missing' },
    };
  }

  const [m] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, parsed.data.match_id))
    .limit(1);
  if (!m) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Match not found' },
    };
  }

  const onTeamA = m.team_a.includes(submitter.id);
  const onTeamB = m.team_b.includes(submitter.id);
  if (!onTeamA && !onTeamB) {
    return {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Only match participants can submit scores',
      },
    };
  }

  // Rate limit per player so a spammer can't flood from multiple IPs.
  const rl = await rateLimit(submitter.id, 'score_submit');
  if (!rl.success) {
    return {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many submissions; slow down for a minute',
      },
    };
  }

  // First writer wins via UNIQUE(match_id).
  const [row] = await db
    .insert(match_results)
    .values({
      match_id: m.id,
      team_a_score: parsed.data.team_a_score,
      team_b_score: parsed.data.team_b_score,
      submitted_by: u.id,
      status: 'pending',
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    return {
      success: false,
      error: {
        code: 'ALREADY_SUBMITTED',
        message:
          'A score has already been submitted for this match. Confirm or dispute it instead.',
      },
    };
  }

  // Fire score_pending to opposing team. Best-effort; never roll back the
  // submission on notification failure.
  const opposingPlayerIds = onTeamA ? m.team_b : m.team_a;
  try {
    const opposingUserRows = await db
      .select({ user_id: players.user_id })
      .from(players)
      .where(eq(players.id, opposingPlayerIds[0]));
    const more = await db
      .select({ user_id: players.user_id })
      .from(players)
      .where(eq(players.id, opposingPlayerIds[1]));
    const opposingUserIds = [
      ...opposingUserRows.map((r) => r.user_id),
      ...more.map((r) => r.user_id),
    ];
    if (opposingUserIds.length > 0) {
      await createNotification({
        user_ids: opposingUserIds,
        type: 'score_pending',
        payload: {
          match_id: m.id,
          tournament_id: m.tournament_id,
          submitted_by_handle: submitter.handle,
        },
      });
    }
  } catch {
    // swallow — best-effort
  }

  try {
    revalidatePath(`/match/${m.id}`);
  } catch {
    // revalidatePath only works inside a request — tests/scripts skip
  }

  return { success: true, data: { pending: true } };
}

// ── confirmScore ─────────────────────────────────────────────────────────────

const ConfirmSchema = z.object({
  match_id: z.string().uuid(),
});

/**
 * Confirm a pending match result. Spec §4.7 step 2-3:
 *
 * - Participation guard: confirmer must be in team_a or team_b. Non-participants
 *   get NOT_FOUND (404 not 403) to avoid leaking match existence.
 * - Opposite-team guard: submitter and confirmer must be on different teams.
 *   Same team → CONFLICT_OF_INTEREST (no state change).
 * - Race-safe: SELECT … FOR UPDATE on match_results inside the transaction.
 *   Second concurrent confirm sees status='confirmed' and returns
 *   { alreadyConfirmed: true }.
 * - Atomic: status flip + ledger write happen in one transaction.
 * - Post-commit: score_confirmed notification fans to all 4 participants.
 */
export async function confirmScore(
  input: z.input<typeof ConfirmSchema>,
  clerkUserId?: string,
): Promise<Result<{ alreadyConfirmed: boolean }>> {
  const userId = clerkUserId ?? (await auth()).userId;
  if (!userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Sign in required' },
    };
  }

  const parsed = ConfirmSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION', message: parsed.error.message },
    };
  }

  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.clerk_id, userId))
    .limit(1);
  if (!u) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'User not synced' },
    };
  }

  const [confirmer] = await db
    .select()
    .from(players)
    .where(eq(players.user_id, u.id))
    .limit(1);
  if (!confirmer) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Match not found' },
    };
  }

  const [m] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, parsed.data.match_id))
    .limit(1);
  if (!m) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Match not found' },
    };
  }

  const confirmerOnA = m.team_a.includes(confirmer.id);
  const confirmerOnB = m.team_b.includes(confirmer.id);
  if (!confirmerOnA && !confirmerOnB) {
    // Non-participant — 404 to avoid leaking that the match exists.
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Match not found' },
    };
  }

  // Transactional state flip + ledger write. The SELECT … FOR UPDATE row lock
  // serializes concurrent confirms; a second confirmer sees status already
  // flipped and we return alreadyConfirmed=true.
  type ConfirmOutcome =
    | { kind: 'no_result' }
    | { kind: 'conflict_of_interest' }
    | { kind: 'already_confirmed'; participantUserIds: string[] }
    | { kind: 'confirmed'; participantUserIds: string[] };

  const outcome: ConfirmOutcome = await db.transaction(async (tx) => {
    // SELECT … FOR UPDATE serializes concurrent confirmers on this match.
    const [mr] = await tx
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, parsed.data.match_id))
      .for('update');
    if (!mr) return { kind: 'no_result' as const };

    // Look up the submitter's player_id from match_results.submitted_by
    // (which stores a user_id).
    const [submitterPlayer] = await tx
      .select({ id: players.id })
      .from(players)
      .where(eq(players.user_id, mr.submitted_by))
      .limit(1);
    if (!submitterPlayer) {
      // Submitter no longer has a player row (shouldn't happen — soft-delete
      // is FK-restricted). Treat as no-result.
      return { kind: 'no_result' as const };
    }
    const submitterOnA = m.team_a.includes(submitterPlayer.id);

    // Opposite-team XOR: confirmer and submitter must be on different teams.
    if (submitterOnA === confirmerOnA) {
      return { kind: 'conflict_of_interest' as const };
    }

    // Resolve all 4 participants' user_ids for notification (need it in both
    // already-confirmed and just-confirmed branches).
    const allPlayerIds = [...m.team_a, ...m.team_b];
    const participantRows = await tx
      .select({ user_id: players.user_id })
      .from(players)
      .where(inArray(players.id, allPlayerIds));
    const participantUserIds = participantRows.map((r) => r.user_id);

    if (mr.status === 'confirmed' || mr.status === 'admin_set') {
      return {
        kind: 'already_confirmed' as const,
        participantUserIds,
      };
    }
    if (mr.status === 'disputed' || mr.status === 'void') {
      // Can't confirm a disputed or voided result; surface as
      // already_confirmed=false so caller knows nothing changed.
      // The UI should route these to the dispute/admin flow.
      return { kind: 'conflict_of_interest' as const };
    }

    const confirmedAt = new Date();
    await tx
      .update(match_results)
      .set({
        status: 'confirmed',
        confirmed_by: u.id,
        confirmed_at: confirmedAt,
      })
      .where(eq(match_results.id, mr.id));

    await writeLedgerInTx(tx as Tx, parsed.data.match_id);

    return { kind: 'confirmed' as const, participantUserIds };
  });

  if (outcome.kind === 'no_result') {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'No pending score for this match' },
    };
  }
  if (outcome.kind === 'conflict_of_interest') {
    return {
      success: false,
      error: {
        code: 'CONFLICT_OF_INTEREST',
        message:
          'Your teammate already submitted. The opposing team must confirm.',
      },
    };
  }

  if (outcome.kind === 'confirmed') {
    // Post-commit notification fan-out. Best-effort; the score is confirmed
    // regardless of whether the notification insert succeeds.
    try {
      await createNotification({
        user_ids: outcome.participantUserIds,
        type: 'score_confirmed',
        payload: { match_id: m.id, tournament_id: m.tournament_id },
      });
    } catch {
      // swallow
    }
  }

  try {
    revalidatePath(`/match/${m.id}`);
    revalidatePath(`/t/${m.tournament_id}`);
  } catch {
    // tests/scripts run outside request context
  }

  return {
    success: true,
    data: { alreadyConfirmed: outcome.kind === 'already_confirmed' },
  };
}

// ── disputeScore ─────────────────────────────────────────────────────────────

const DisputeSchema = z.object({
  match_id: z.string().uuid(),
});

/**
 * Dispute a pending match result. Spec §4.7 step 4.
 *
 * - Must be a participant (404 not 403 on outsider).
 * - Transitions status pending → disputed inside SELECT … FOR UPDATE.
 * - Post-commit fans `score_disputed` to all club admins of the parent
 *   tournament's club.
 *
 * Same-team submitter → dispute is allowed (a participant might want to
 * back out their own submission); the spec does not restrict it.
 */
export async function disputeScore(
  input: z.input<typeof DisputeSchema>,
  clerkUserId?: string,
): Promise<Result<{ disputed: true }>> {
  const userId = clerkUserId ?? (await auth()).userId;
  if (!userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Sign in required' },
    };
  }

  const parsed = DisputeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION', message: parsed.error.message },
    };
  }

  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.clerk_id, userId))
    .limit(1);
  if (!u) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'User not synced' },
    };
  }

  const [disputer] = await db
    .select()
    .from(players)
    .where(eq(players.user_id, u.id))
    .limit(1);

  const [m] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, parsed.data.match_id))
    .limit(1);
  if (!m) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Match not found' },
    };
  }

  if (
    !disputer ||
    (!m.team_a.includes(disputer.id) && !m.team_b.includes(disputer.id))
  ) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Match not found' },
    };
  }

  const outcome = await db.transaction(async (tx) => {
    const [mr] = await tx
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, parsed.data.match_id))
      .for('update');
    if (!mr) return { ok: false as const, code: 'NOT_FOUND' };
    if (mr.status !== 'pending') {
      return { ok: false as const, code: 'WRONG_STATUS' };
    }
    await tx
      .update(match_results)
      .set({ status: 'disputed' })
      .where(eq(match_results.id, mr.id));
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return {
      success: false,
      error: {
        code: outcome.code,
        message:
          outcome.code === 'NOT_FOUND'
            ? 'No pending score for this match'
            : 'Match is not in a disputable state',
      },
    };
  }

  // Notify all club admins of the tournament's club.
  try {
    const adminRows = await db
      .select({ user_id: club_memberships.user_id })
      .from(club_memberships)
      .innerJoin(tournaments, eq(tournaments.club_id, club_memberships.club_id))
      .where(eq(tournaments.id, m.tournament_id));
    const adminUserIds = adminRows
      .map((r) => r.user_id)
      .filter((id, i, arr) => arr.indexOf(id) === i); // dedupe
    if (adminUserIds.length > 0) {
      await createNotification({
        user_ids: adminUserIds,
        type: 'score_disputed',
        payload: {
          match_id: m.id,
          tournament_id: m.tournament_id,
        },
      });
    }
  } catch {
    // best-effort
  }

  try {
    revalidatePath(`/match/${m.id}`);
  } catch {
    // outside request
  }

  return { success: true, data: { disputed: true } };
}

// ── adminOverrideMatch + adminVoidMatch ─────────────────────────────────────

const OverrideSchema = z.object({
  match_id: z.string().uuid(),
  team_a_score: z.number().int().min(0).max(99),
  team_b_score: z.number().int().min(0).max(99),
});

const VoidSchema = z.object({
  match_id: z.string().uuid(),
});

/**
 * Shared admin guard: returns the resolved {users.id, tournament, match}
 * trio plus a participation check. Centralizes the auth+lookup logic so
 * adminOverrideMatch and adminVoidMatch don't duplicate it.
 */
async function resolveAdminContext(
  clerkUserId: string | undefined,
  matchId: string,
): Promise<
  | {
      ok: true;
      adminUserId: string;
      match: typeof matches.$inferSelect;
      tournamentClubId: string;
      isParticipant: boolean;
    }
  | { ok: false; error: { code: string; message: string } }
> {
  const userId = clerkUserId ?? (await auth()).userId;
  if (!userId) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Sign in required' },
    };
  }
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.clerk_id, userId))
    .limit(1);
  if (!u) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'User not synced' },
    };
  }
  const [m] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!m) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Match not found' },
    };
  }
  const [t] = await db
    .select({ club_id: tournaments.club_id })
    .from(tournaments)
    .where(eq(tournaments.id, m.tournament_id))
    .limit(1);
  if (!t) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Tournament missing' },
    };
  }
  try {
    await assertClubAdmin(u.id, t.club_id);
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: e.message },
      };
    }
    throw e;
  }
  // Is the admin also a player in this match?
  const [adminPlayer] = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.user_id, u.id))
    .limit(1);
  const isParticipant =
    !!adminPlayer &&
    (m.team_a.includes(adminPlayer.id) || m.team_b.includes(adminPlayer.id));

  return {
    ok: true,
    adminUserId: u.id,
    match: m,
    tournamentClubId: t.club_id,
    isParticipant,
  };
}

/**
 * Mark every leaderboard_snapshots row for the affected players' tiers as
 * stale. The Sunday cron rebuilds stale snapshots from the ledger.
 *
 * Conservative: marks ALL snapshots for those tiers regardless of period
 * window. Cheap to over-mark; rebuild is idempotent.
 */
async function markSnapshotsStaleForMatch(
  tx: Tx,
  matchPlayerIds: readonly string[],
): Promise<void> {
  const tierRows = await tx
    .select({ tier: players.tier })
    .from(players)
    .where(inArray(players.id, [...matchPlayerIds]));
  const tiers = [...new Set(tierRows.map((r) => r.tier))];
  if (tiers.length === 0) return;
  for (const tier of tiers) {
    await tx
      .update(leaderboard_snapshots)
      .set({ stale: true })
      .where(eq(leaderboard_snapshots.tier, tier));
  }
}

async function fanoutParticipantUserIds(
  matchPlayerIds: readonly string[],
): Promise<string[]> {
  const rows = await db
    .select({ user_id: players.user_id })
    .from(players)
    .where(inArray(players.id, [...matchPlayerIds]));
  return rows.map((r) => r.user_id);
}

/**
 * Admin override of a match score. Spec §4.7 step 5.
 *
 * - Caller must be a club admin of the parent tournament's club.
 * - Admin must NOT be a participant in this match (CONFLICT_OF_INTEREST).
 * - Transaction: upsert match_results to admin_set + delete ledger rows +
 *   rewrite ledger + mark affected snapshots stale.
 * - Race-safe via SELECT … FOR UPDATE; second admin sees status=admin_set
 *   and gets ALREADY_OVERRIDDEN.
 * - Post-commit: createNotification('score_overridden') to all 4 participants.
 */
export async function adminOverrideMatch(
  input: z.input<typeof OverrideSchema>,
  clerkUserId?: string,
): Promise<Result<{ overridden: true }>> {
  const parsed = OverrideSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION', message: parsed.error.message },
    };
  }
  const ctx = await resolveAdminContext(clerkUserId, parsed.data.match_id);
  if (!ctx.ok) {
    return { success: false, error: ctx.error };
  }
  if (ctx.isParticipant) {
    return {
      success: false,
      error: {
        code: 'CONFLICT_OF_INTEREST',
        message: 'Admin is a participant in this match — another admin must override.',
      },
    };
  }

  const matchPlayerIds = [...ctx.match.team_a, ...ctx.match.team_b];

  const outcome = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, parsed.data.match_id))
      .for('update');

    if (existing && existing.status === 'admin_set') {
      return { kind: 'already' as const };
    }

    if (existing) {
      await tx
        .update(match_results)
        .set({
          team_a_score: parsed.data.team_a_score,
          team_b_score: parsed.data.team_b_score,
          status: 'admin_set',
          confirmed_by: ctx.adminUserId,
          confirmed_at: new Date(),
        })
        .where(eq(match_results.id, existing.id));
    } else {
      await tx.insert(match_results).values({
        match_id: parsed.data.match_id,
        team_a_score: parsed.data.team_a_score,
        team_b_score: parsed.data.team_b_score,
        submitted_by: ctx.adminUserId,
        confirmed_by: ctx.adminUserId,
        status: 'admin_set',
        confirmed_at: new Date(),
      });
    }

    await tx
      .delete(points_ledger)
      .where(eq(points_ledger.match_id, parsed.data.match_id));

    await writeLedgerInTx(tx as Tx, parsed.data.match_id);
    await markSnapshotsStaleForMatch(tx as Tx, matchPlayerIds);

    return { kind: 'overridden' as const };
  });

  if (outcome.kind === 'already') {
    return {
      success: false,
      error: {
        code: 'ALREADY_OVERRIDDEN',
        message: 'Match was already overridden by another admin.',
      },
    };
  }

  try {
    const participantUserIds = await fanoutParticipantUserIds(matchPlayerIds);
    if (participantUserIds.length > 0) {
      await createNotification({
        user_ids: participantUserIds,
        type: 'score_overridden',
        payload: {
          match_id: ctx.match.id,
          tournament_id: ctx.match.tournament_id,
        },
      });
    }
  } catch {
    // best-effort
  }

  try {
    revalidatePath(`/match/${ctx.match.id}`);
    revalidatePath(`/t/${ctx.match.tournament_id}`);
  } catch {
    // outside request
  }

  return { success: true, data: { overridden: true } };
}

/**
 * Admin void of a match. Spec §4.7 step 6.
 *
 * - Same admin + non-participant guard as override.
 * - Sets BOTH matches.status='void' AND match_results.status='void' inside
 *   one transaction; deletes ledger rows; marks snapshots stale.
 * - If match_results doesn't exist, creates one with status='void' (admin
 *   voids a match nobody bothered to score).
 * - Post-commit: notifies all 4 participants with payload.void=true.
 */
export async function adminVoidMatch(
  input: z.input<typeof VoidSchema>,
  clerkUserId?: string,
): Promise<Result<{ voided: true }>> {
  const parsed = VoidSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION', message: parsed.error.message },
    };
  }
  const ctx = await resolveAdminContext(clerkUserId, parsed.data.match_id);
  if (!ctx.ok) {
    return { success: false, error: ctx.error };
  }
  if (ctx.isParticipant) {
    return {
      success: false,
      error: {
        code: 'CONFLICT_OF_INTEREST',
        message: 'Admin is a participant in this match — another admin must void.',
      },
    };
  }

  const matchPlayerIds = [...ctx.match.team_a, ...ctx.match.team_b];

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, parsed.data.match_id))
      .for('update');

    if (existing) {
      await tx
        .update(match_results)
        .set({
          status: 'void',
          confirmed_by: ctx.adminUserId,
          confirmed_at: new Date(),
        })
        .where(eq(match_results.id, existing.id));
    } else {
      await tx.insert(match_results).values({
        match_id: parsed.data.match_id,
        team_a_score: 0,
        team_b_score: 0,
        submitted_by: ctx.adminUserId,
        confirmed_by: ctx.adminUserId,
        status: 'void',
        confirmed_at: new Date(),
      });
    }

    await tx
      .update(matches)
      .set({ status: 'void' })
      .where(eq(matches.id, parsed.data.match_id));

    await tx
      .delete(points_ledger)
      .where(eq(points_ledger.match_id, parsed.data.match_id));

    await markSnapshotsStaleForMatch(tx as Tx, matchPlayerIds);
  });

  try {
    const participantUserIds = await fanoutParticipantUserIds(matchPlayerIds);
    if (participantUserIds.length > 0) {
      await createNotification({
        user_ids: participantUserIds,
        type: 'score_overridden',
        payload: {
          match_id: ctx.match.id,
          tournament_id: ctx.match.tournament_id,
          void: true,
        },
      });
    }
  } catch {
    // best-effort
  }

  try {
    revalidatePath(`/match/${ctx.match.id}`);
    revalidatePath(`/t/${ctx.match.tournament_id}`);
  } catch {
    // outside request
  }

  return { success: true, data: { voided: true } };
}
