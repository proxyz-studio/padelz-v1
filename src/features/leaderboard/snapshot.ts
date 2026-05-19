import { sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import type { LeaderboardPeriod } from './types';

/**
 * Rebuild the leaderboard_snapshots for the given period and period start.
 *
 * ICT week: Monday 00:00 ICT = Sunday 17:00 UTC.
 * Ranking: points_sum DESC, match_count DESC, created_at ASC (older player wins ties).
 * Gate: HAVING COUNT(*) >= 1 — players with zero ledger entries in the window are excluded.
 * Idempotent: ON CONFLICT DO UPDATE upserts rank/points/match_count/rebuilt_at.
 */
export async function rebuildSnapshot(
  period: LeaderboardPeriod,
  periodStart: Date,
): Promise<void> {
  const periodEnd = computePeriodEnd(period, periodStart);
  // period_start column is type `date` — pass ISO date string (YYYY-MM-DD) so postgres
  // doesn't coerce from a full timestamptz and produce an off-by-one on the date boundary.
  const periodStartDate = toISODate(periodStart);

  await db.execute(sql`
    INSERT INTO leaderboard_snapshots
      (period, period_start, tier, player_id, rank, points_sum, match_count, stale, rebuilt_at)
    SELECT
      ${period}::leaderboard_period                             AS period,
      ${periodStartDate}::date                                  AS period_start,
      p.tier,
      pl.player_id,
      ROW_NUMBER() OVER (
        PARTITION BY p.tier
        ORDER BY SUM(pl.points::numeric) DESC,
                 COUNT(pl.id)            DESC,
                 p.created_at            ASC
      )                                                         AS rank,
      SUM(pl.points::numeric)                                   AS points_sum,
      COUNT(pl.id)::int                                         AS match_count,
      FALSE                                                     AS stale,
      NOW()                                                     AS rebuilt_at
    FROM points_ledger pl
    INNER JOIN players p ON p.id = pl.player_id
    WHERE pl.earned_at >= ${periodStart.toISOString()}::timestamptz
      AND pl.earned_at <  ${periodEnd.toISOString()}::timestamptz
      AND p.redacted_at IS NULL
    GROUP BY p.tier, pl.player_id, p.created_at
    HAVING COUNT(pl.id) >= 1
    ON CONFLICT (period, period_start, tier, player_id) DO UPDATE
      SET rank        = EXCLUDED.rank,
          points_sum  = EXCLUDED.points_sum,
          match_count = EXCLUDED.match_count,
          stale       = FALSE,
          rebuilt_at  = NOW()
  `);
}

/**
 * Compute the exclusive end boundary of a period given its inclusive start.
 * All arithmetic is in UTC — the caller already passed a UTC instant that
 * corresponds to the ICT period boundary.
 */
function computePeriodEnd(period: LeaderboardPeriod, start: Date): Date {
  const d = new Date(start);
  if (period === 'week') {
    d.setUTCDate(d.getUTCDate() + 7);
  } else if (period === 'month') {
    d.setUTCMonth(d.getUTCMonth() + 1);
  } else if (period === 'season') {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return d;
}

/**
 * Return the start of the current ISO week (Monday 00:00) in ICT (UTC+7),
 * expressed as a UTC instant.
 *
 * Algorithm:
 *   1. Shift now() forward by 7 hours to get the ICT clock reading.
 *   2. Find how many days back to Monday (day 1; Sunday=0 → treat as 7).
 *   3. Zero out H/M/S/ms at ICT midnight.
 *   4. Shift back by 7 hours to convert the ICT midnight to UTC.
 */
export function currentWeekStartICT(): Date {
  const now = new Date();
  // Step 1: shift to ICT
  const ictMs = now.getTime() + 7 * 60 * 60 * 1000;
  const ict = new Date(ictMs);

  // Step 2: Monday offset (getUTCDay on the shifted date gives ICT day-of-week)
  const dow = ict.getUTCDay(); // 0=Sun … 6=Sat
  const daysBack = dow === 0 ? 6 : dow - 1;

  // Step 3: ICT midnight of Monday
  const mondayICT = new Date(ictMs);
  mondayICT.setUTCDate(mondayICT.getUTCDate() - daysBack);
  mondayICT.setUTCHours(0, 0, 0, 0);

  // Step 4: back to UTC
  return new Date(mondayICT.getTime() - 7 * 60 * 60 * 1000);
}

/** Format a Date as YYYY-MM-DD for postgres `date` columns. Uses UTC date parts. */
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
