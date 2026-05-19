import { eq, and, lt } from 'drizzle-orm';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { db } from '@/libs/DB';
import { club_memberships, match_results, matches, tournaments } from '@/models/Schema';
import { createNotification } from '@/features/notifications/actions';

export const dynamic = 'force-dynamic';

/**
 * Daily expire-pending cron. Triggered by Vercel Cron at 00:30 ICT (17:30 UTC previous day).
 *
 * Finds match_results whose status is 'pending' and submitted_at is more than 48 hours ago.
 * For each stuck match, notifies all club admins of the owning club with a 'pending_expired'
 * notification. Does NOT change the match_result status — a human admin must act.
 *
 * Authorization: Bearer <CRON_SECRET> required.
 */
export async function POST(req: Request): Promise<Response> {
  if (req.headers.get('authorization') !== `Bearer ${Env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Find all pending match_results older than 48 h, joined to club via tournament
  const stuck = await db
    .select({
      match_id: match_results.match_id,
      tournament_id: matches.tournament_id,
      club_id: tournaments.club_id,
    })
    .from(match_results)
    .innerJoin(matches, eq(matches.id, match_results.match_id))
    .innerJoin(tournaments, eq(tournaments.id, matches.tournament_id))
    .where(
      and(
        eq(match_results.status, 'pending'),
        lt(match_results.submitted_at, cutoff),
      ),
    );

  let notified = 0;
  for (const row of stuck) {
    const admins = await db
      .select({ user_id: club_memberships.user_id })
      .from(club_memberships)
      .where(
        and(
          eq(club_memberships.club_id, row.club_id),
          eq(club_memberships.role, 'admin'),
        ),
      );

    if (admins.length === 0) continue;

    const result = await createNotification({
      user_ids: admins.map((a) => a.user_id),
      type: 'pending_expired',
      payload: { match_id: row.match_id, tournament_id: row.tournament_id },
    });

    if (result.success) notified += admins.length;
  }

  logger.info({ expired: stuck.length, notified }, 'expire-pending cron complete');

  return Response.json({ ok: true, expired: stuck.length });
}
