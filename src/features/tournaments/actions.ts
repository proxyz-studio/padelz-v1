'use server';

import { auth } from '@clerk/nextjs/server';
import { customAlphabet } from 'nanoid';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/libs/DB';
import { rateLimit } from '@/libs/RateLimit';
import {
  brackets,
  club_memberships,
  matches,
  players,
  registrations,
  tournaments,
  users,
} from '@/models/Schema';
import { TIERS, TIER_TO_INT } from '@/features/profiles/types';
import type { Result } from '@/features/scoring/types';
import { createNotification } from '@/features/notifications/actions';
import { generateBracketData } from './bracket';

const slugSuffix = customAlphabet(
  'abcdefghijklmnopqrstuvwxyz0123456789',
  6,
);

// ── createTournament ─────────────────────────────────────────────────────────

const CreateSchema = z
  .object({
    club_id: z.string().uuid(),
    name: z.string().min(3).max(120),
    format: z.enum(['americano', 'mexicano', 'round_robin', 'bracket']),
    tournament_type: z.enum(['open', 'club_internal', 'group', 'casual']),
    start_at: z.string().datetime(),
    tier_min: z.enum(TIERS).nullable(),
    tier_max: z.enum(TIERS).nullable(),
  })
  .refine(
    (d) =>
      !d.tier_min ||
      !d.tier_max ||
      TIER_TO_INT[d.tier_min] <= TIER_TO_INT[d.tier_max],
    { message: 'tier_min must be at or below tier_max' },
  );

/**
 * Create a tournament. Requires the caller to be a club admin
 * (club_memberships.role='admin') of the target club. Status defaults
 * to 'draft' — admins can flip to 'open' via a separate publish action.
 *
 * Pass `clerkUserId` explicitly from integration tests; production calls
 * resolve it from Clerk's auth() in middleware.
 */
export async function createTournament(
  input: z.input<typeof CreateSchema>,
  clerkUserId?: string,
): Promise<Result<{ tournament_id: string; slug: string }>> {
  const userId = clerkUserId ?? (await auth()).userId;
  if (!userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Sign in required' },
    };
  }

  const parsed = CreateSchema.safeParse(input);
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

  const [member] = await db
    .select({ role: club_memberships.role })
    .from(club_memberships)
    .where(
      and(
        eq(club_memberships.user_id, u.id),
        eq(club_memberships.club_id, parsed.data.club_id),
      ),
    )
    .limit(1);
  if (!member || member.role !== 'admin') {
    return {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Not an admin of this club' },
    };
  }

  const slugBase = parsed.data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const slug = `${slugBase}-${slugSuffix()}`;

  const [t] = await db
    .insert(tournaments)
    .values({
      slug,
      club_id: parsed.data.club_id,
      name: parsed.data.name,
      format: parsed.data.format,
      tournament_type: parsed.data.tournament_type,
      start_at: new Date(parsed.data.start_at),
      tier_min: parsed.data.tier_min,
      tier_max: parsed.data.tier_max,
      status: 'draft',
      created_by: u.id,
    })
    .returning();

  try {
    revalidatePath('/t');
  } catch {
    // revalidatePath only works inside a request — tests/scripts run outside
  }
  return { success: true, data: { tournament_id: t.id, slug: t.slug } };
}

// ── registerForTournament ────────────────────────────────────────────────────

const RegisterSchema = z.object({ tournament_id: z.string().uuid() });

/**
 * Register the calling player for a tournament. Checks:
 * - rate limit per IP (registration kind)
 * - tournament exists and is in draft/open status
 * - player tier is within the tournament's tier band
 * - not already registered (idempotent via onConflictDoNothing)
 *
 * On success, fans a 'registration_confirmed' notification to the player.
 */
export async function registerForTournament(
  input: z.input<typeof RegisterSchema>,
  clerkUserId?: string,
): Promise<Result<{ registration_id: string }>> {
  const userId = clerkUserId ?? (await auth()).userId;
  if (!userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Sign in required' },
    };
  }

  // Rate limit per IP (proxy.ts also gates the route at edge; this is the
  // server-action backstop). headers() requires request context, so guard
  // for tests/scripts running outside that context.
  let ip = 'unknown';
  try {
    const h = await headers();
    ip = (h.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  } catch {
    ip = 'test';
  }
  const rl = await rateLimit(ip, 'registration');
  if (!rl.success) {
    return {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many registrations from this IP',
      },
    };
  }

  const parsed = RegisterSchema.safeParse(input);
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

  const [p] = await db
    .select()
    .from(players)
    .where(eq(players.user_id, u.id))
    .limit(1);
  if (!p) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Player profile missing' },
    };
  }

  const [t] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, parsed.data.tournament_id))
    .limit(1);
  if (!t) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Tournament not found' },
    };
  }

  if (t.status !== 'open' && t.status !== 'draft') {
    return {
      success: false,
      error: { code: 'CLOSED', message: 'Registration closed' },
    };
  }

  if (t.tier_min && TIER_TO_INT[p.tier] < TIER_TO_INT[t.tier_min]) {
    return {
      success: false,
      error: {
        code: 'TIER_TOO_LOW',
        message: `Tournament requires ${t.tier_min}+; you are ${p.tier}`,
      },
    };
  }

  if (t.tier_max && TIER_TO_INT[p.tier] > TIER_TO_INT[t.tier_max]) {
    return {
      success: false,
      error: {
        code: 'TIER_TOO_HIGH',
        message: `Tournament capped at ${t.tier_max}; you are ${p.tier}`,
      },
    };
  }

  const [reg] = await db
    .insert(registrations)
    .values({
      tournament_id: t.id,
      player_id: p.id,
      status: 'registered',
    })
    .onConflictDoNothing()
    .returning();

  if (!reg) {
    return {
      success: false,
      error: {
        code: 'ALREADY_REGISTERED',
        message: 'You are already registered for this tournament',
      },
    };
  }

  // Fan-out notification — fire-and-don't-rollback. If the notification fails,
  // we still keep the registration row; better to be registered without a notif
  // than to fail registration on a notification glitch.
  try {
    await createNotification({
      user_ids: [u.id],
      type: 'registration_confirmed',
      payload: {
        tournament_id: t.id,
        tournament_name: t.name,
        tournament_slug: t.slug,
      },
    });
  } catch {
    // swallow — notification is best-effort
  }

  try {
    revalidatePath(`/t/${t.slug}`);
    revalidatePath('/t');
  } catch {
    // revalidatePath only works inside a request
  }
  return { success: true, data: { registration_id: reg.id } };
}

// ── generateBracket ──────────────────────────────────────────────────────────

const GenerateBracketSchema = z.object({ tournament_id: z.string().uuid() });

/**
 * Generate bracket + matches for a tournament in a single transaction.
 * Requires the caller to be a club admin for the tournament's club.
 * Idempotent guard: returns ALREADY_GENERATED if a bracket row already exists.
 *
 * The `brackets.data` jsonb stores the full BracketData structure.
 * The `matches` rows are inserted with `team_a` and `team_b` as UUID arrays.
 *
 * Pass `clerkUserId` explicitly from integration tests.
 */
export async function generateBracket(
  input: z.input<typeof GenerateBracketSchema>,
  clerkUserId?: string,
): Promise<Result<{ bracket_id: string; match_count: number }>> {
  const userId = clerkUserId ?? (await auth()).userId;
  if (!userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Sign in required' },
    };
  }

  const parsed = GenerateBracketSchema.safeParse(input);
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

  const [t] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, parsed.data.tournament_id))
    .limit(1);
  if (!t) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Tournament not found' },
    };
  }

  const [member] = await db
    .select({ role: club_memberships.role })
    .from(club_memberships)
    .where(
      and(
        eq(club_memberships.user_id, u.id),
        eq(club_memberships.club_id, t.club_id),
      ),
    )
    .limit(1);
  if (!member || member.role !== 'admin') {
    return {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Not an admin of this club' },
    };
  }

  // Idempotent guard
  const [existing] = await db
    .select({ id: brackets.id })
    .from(brackets)
    .where(eq(brackets.tournament_id, t.id))
    .limit(1);
  if (existing) {
    return {
      success: false,
      error: {
        code: 'ALREADY_GENERATED',
        message: 'Bracket already generated for this tournament',
      },
    };
  }

  // Load registered players (registered status only)
  const regRows = await db
    .select({ player_id: registrations.player_id })
    .from(registrations)
    .where(
      and(
        eq(registrations.tournament_id, t.id),
        eq(registrations.status, 'registered'),
      ),
    );

  const playerIds = regRows.map((r) => r.player_id);

  let bracketData;
  try {
    bracketData = generateBracketData(playerIds, t.format);
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'INVALID_PLAYER_COUNT',
        message: err instanceof Error ? err.message : 'Invalid player count',
      },
    };
  }

  // Flatten all matches from bracketData into DB rows
  type MatchRow = { team_a: string[]; team_b: string[] };
  const matchRows: MatchRow[] = [];

  if (bracketData.format === 'round_robin' || bracketData.format === 'bracket') {
    for (const m of bracketData.matches) {
      matchRows.push({ team_a: m.team_a, team_b: m.team_b });
    }
  } else if (bracketData.format === 'americano' || bracketData.format === 'mexicano') {
    for (const round of bracketData.rounds) {
      for (const m of round.matches) {
        matchRows.push({ team_a: m.team_a, team_b: m.team_b });
      }
    }
  }

  // Single transaction: insert brackets row + all matches rows
  const [bracket] = await db.transaction(async (tx) => {
    const [b] = await tx
      .insert(brackets)
      .values({
        tournament_id: t.id,
        data: bracketData as Record<string, unknown>,
      })
      .returning();

    if (matchRows.length > 0) {
      await tx.insert(matches).values(
        matchRows.map((mr) => ({
          tournament_id: t.id,
          team_a: mr.team_a,
          team_b: mr.team_b,
          status: 'scheduled' as const,
        })),
      );
    }

    return [b];
  });

  try {
    revalidatePath(`/t/${t.slug}`);
    revalidatePath(`/t/${t.slug}/bracket`);
  } catch {
    // revalidatePath only works inside a request
  }

  return {
    success: true,
    data: { bracket_id: bracket.id, match_count: matchRows.length },
  };
}
