'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
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
