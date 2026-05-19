import { sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { promotePlayer } from '@/features/profiles/actions';
import type { Tier } from '@/features/profiles/types';

type CandidateRow = {
  player_id: string;
  from_tier: string;
  to_tier: string | null;
};

/**
 * Check for players eligible for automatic promotion and promote them.
 *
 * Eligibility criteria:
 *  - rank <= 3 in ALL 4 most recent weekly snapshots ending at or including currentWeekStart
 *  - same tier across all 4 weeks (no mid-window tier change)
 *  - SUM(match_count) >= 4 across those 4 weeks
 *  - not already at diamond (no tier above to promote to)
 *
 * Uses pg_try_advisory_lock(bigint) keyed on the period date so concurrent
 * invocations (e.g. cron double-fire) are safe. The lock is session-scoped
 * and released in the finally block.
 */
export async function checkAutoPromote(
  currentWeekStart: Date,
): Promise<{ promoted: number }> {
  const periodKey = currentWeekStart.toISOString().slice(0, 10);
  // hashtextextended(text, seed) → bigint — deterministic, collision-resistant
  const lockRows = await db.execute<{ pg_try_advisory_lock: boolean }>(
    sql`SELECT pg_try_advisory_lock(hashtextextended(${'padelz_promote_' + periodKey}, 0))`,
  );

  const acquired = Array.isArray(lockRows) ? (lockRows[0] as CandidateRow & { pg_try_advisory_lock: boolean } | undefined) : undefined;
  if (!acquired?.pg_try_advisory_lock) {
    logger.info({ periodKey }, 'auto-promote advisory lock not acquired — skipping');
    return { promoted: 0 };
  }

  try {
    // Oldest week we look back to: 3 weeks before currentWeekStart
    const oldestWeekStart = new Date(currentWeekStart.getTime() - 3 * 7 * 24 * 60 * 60 * 1000);

    const candidates = await db.execute<CandidateRow>(sql`
      WITH last4 AS (
        SELECT player_id, tier, rank, match_count, period_start
        FROM leaderboard_snapshots
        WHERE period       = 'week'
          AND period_start >= ${oldestWeekStart.toISOString().slice(0, 10)}::date
          AND period_start <= ${currentWeekStart.toISOString().slice(0, 10)}::date
      ),
      eligible AS (
        SELECT
          player_id,
          MIN(tier::text)       AS tier_min_txt,
          MAX(tier::text)       AS tier_max_txt,
          COUNT(*)              AS week_count,
          SUM(match_count)      AS cumulative_matches
        FROM last4
        WHERE rank <= 3
        GROUP BY player_id
        HAVING COUNT(*) = 4
           AND MIN(tier::text) = MAX(tier::text)
           AND SUM(match_count) >= 4
      )
      SELECT
        e.player_id,
        e.tier_min_txt AS from_tier,
        CASE e.tier_min_txt
          WHEN 'bronze'   THEN 'silver'
          WHEN 'silver'   THEN 'gold'
          WHEN 'gold'     THEN 'platinum'
          WHEN 'platinum' THEN 'diamond'
          ELSE NULL
        END AS to_tier
      FROM eligible e
      -- Only promote if the player's current tier still matches the snapshot tier
      -- (guards against double-promotion on re-run within the same period)
      INNER JOIN players p ON p.id = e.player_id AND p.tier::text = e.tier_min_txt
      WHERE e.tier_min_txt <> 'diamond'
        AND p.redacted_at IS NULL
    `);

    const rows: CandidateRow[] = Array.isArray(candidates) ? (candidates as CandidateRow[]) : [];

    let promoted = 0;
    for (const c of rows) {
      if (!c.to_tier) continue;
      try {
        const result = await promotePlayer({
          player_id: c.player_id,
          new_tier: c.to_tier as Tier,
          reason: 'auto_promote',
        });
        if (result.success) {
          promoted++;
          logger.info({ player_id: c.player_id, from: c.from_tier, to: c.to_tier }, 'auto-promoted');
        } else {
          logger.warn({ player_id: c.player_id, error: result.error }, 'auto-promote failed');
        }
      } catch (err) {
        logger.error({ player_id: c.player_id, err }, 'auto-promote threw');
      }
    }

    return { promoted };
  } finally {
    await db.execute(
      sql`SELECT pg_advisory_unlock(hashtextextended(${'padelz_promote_' + periodKey}, 0))`,
    );
  }
}
