'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/libs/DB';
import { rateLimit } from '@/libs/RateLimit';
import {
  match_results,
  matches,
  players,
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
