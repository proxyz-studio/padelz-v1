import { afterAll, beforeAll, beforeEach } from 'vitest';
import { db } from '@/libs/DB';
import { sql } from 'drizzle-orm';

beforeAll(async () => { /* drizzle migrations already applied via db:migrate */ });
beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE
    notifications, leaderboard_snapshots, points_ledger, match_results,
    matches, brackets, registrations, tournaments,
    tier_history, club_memberships, players, clubs, users
  CASCADE`);
});
afterAll(async () => { /* no-op; connection closes on process exit */ });
