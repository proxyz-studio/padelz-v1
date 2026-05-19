import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { rebuildSnapshot, currentWeekStartICT } from '@/features/leaderboard/snapshot';
import { checkAutoPromote } from '@/features/leaderboard/autopromote';

export const dynamic = 'force-dynamic';

/**
 * Weekly leaderboard cron. Triggered by Vercel Cron at Sun 23:55 ICT (16:55 UTC).
 *
 * 1. Rebuild the 'week' snapshot for the current ISO week (Mon 00:00 ICT boundary).
 * 2. Rebuild the 'month' snapshot for the calendar month that contains this week.
 * 3. Run auto-promotion check against the freshly written snapshots.
 *
 * Returns JSON { ok: true, promoted: N }.
 * Authorization: Bearer <CRON_SECRET> header required (Vercel injects this automatically).
 */
export async function POST(req: Request): Promise<Response> {
  if (req.headers.get('authorization') !== `Bearer ${Env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const t0 = Date.now();
  const weekStart = currentWeekStartICT();

  // Month start: first day of the month that contains weekStart, expressed as
  // ICT midnight then shifted back to UTC.
  // We shift weekStart forward 7 h to get ICT date components, build ICT midnight
  // of day 1 of that month, then shift back to UTC.
  const weekStartICT = new Date(weekStart.getTime() + 7 * 60 * 60 * 1000);
  const monthStartICT = new Date(
    Date.UTC(weekStartICT.getUTCFullYear(), weekStartICT.getUTCMonth(), 1, 0, 0, 0),
  );
  const monthStart = new Date(monthStartICT.getTime() - 7 * 60 * 60 * 1000);

  await rebuildSnapshot('week', weekStart);
  await rebuildSnapshot('month', monthStart);

  const { promoted } = await checkAutoPromote(weekStart);

  logger.info(
    { promoted, weekStart: weekStart.toISOString(), durationMs: Date.now() - t0 },
    'leaderboard cron complete',
  );

  return Response.json({ ok: true, promoted });
}
