import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq, and } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  club_memberships,
  clubs,
  match_results,
  matches,
  notifications,
  players,
  tournaments,
  users,
} from '@/models/Schema';
import { POST } from '@/app/api/cron/expire-pending/route';
import { Env } from '@/libs/Env';

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/expire-pending', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

/**
 * Seed a tournament environment with one pending match_result.
 * submittedAt controls whether it's over the 48h threshold.
 */
async function seedPendingMatch(suffix: string, submittedAt: Date) {
  // Admin user + club
  const clerkAdmin = `ck-ep-adm-${suffix}`;
  const [uAdmin] = await db
    .insert(users)
    .values({ clerk_id: clerkAdmin, email: `${clerkAdmin}@x.test` })
    .returning();
  const [pAdmin] = await db
    .insert(players)
    .values({ user_id: uAdmin.id, handle: `ep-adm-${suffix}`, display_name: `Adm ${suffix}`, tier: 'bronze' })
    .returning();

  // A second user who submitted the score
  const clerkSubmitter = `ck-ep-sub-${suffix}`;
  const [uSubmitter] = await db
    .insert(users)
    .values({ clerk_id: clerkSubmitter, email: `${clerkSubmitter}@x.test` })
    .returning();

  const [c] = await db
    .insert(clubs)
    .values({ slug: `ep-club-${suffix}`, name: `EP Club ${suffix}` })
    .returning();

  await db
    .insert(club_memberships)
    .values({ user_id: uAdmin.id, club_id: c.id, role: 'admin' });

  const [t] = await db
    .insert(tournaments)
    .values({
      slug: `ep-t-${suffix}`,
      club_id: c.id,
      name: `EP T ${suffix}`,
      format: 'americano',
      start_at: new Date(),
      created_by: uAdmin.id,
    })
    .returning();

  const [m] = await db
    .insert(matches)
    .values({ tournament_id: t.id, team_a: [], team_b: [] })
    .returning();

  await db.insert(match_results).values({
    match_id: m.id,
    team_a_score: 21,
    team_b_score: 15,
    submitted_by: uSubmitter.id,
    status: 'pending',
    submitted_at: submittedAt,
  });

  return { adminUserId: uAdmin.id, matchId: m.id, clubId: c.id };
}

describe('POST /api/cron/expire-pending', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const res = await POST(makeRequest('Bearer definitely-wrong-secret-xxxx'));
    expect(res.status).toBe(401);
  });

  it('notifies club admins for pending results older than 48 hours', async () => {
    const stamp = uuidv7().slice(0, 8);
    const staleTime = new Date(Date.now() - 49 * 60 * 60 * 1000); // 49 h ago

    const { adminUserId } = await seedPendingMatch(stamp, staleTime);

    const res = await POST(makeRequest(`Bearer ${Env.CRON_SECRET}`));
    expect(res.status).toBe(200);

    const body = await res.json() as { ok: boolean; expired: number };
    expect(body.ok).toBe(true);
    expect(body.expired).toBeGreaterThanOrEqual(1);

    const notifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.user_id, adminUserId),
          eq(notifications.type, 'pending_expired'),
        ),
      );
    expect(notifs.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT notify for pending results less than 48 hours old', async () => {
    const stamp = uuidv7().slice(0, 8);
    const freshTime = new Date(Date.now() - 10 * 60 * 60 * 1000); // 10 h ago

    const { adminUserId } = await seedPendingMatch(`fr-${stamp}`, freshTime);

    const res = await POST(makeRequest(`Bearer ${Env.CRON_SECRET}`));
    expect(res.status).toBe(200);

    const notifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.user_id, adminUserId),
          eq(notifications.type, 'pending_expired'),
        ),
      );
    expect(notifs.length).toBe(0);
  });

  it('does NOT change the match_result status — only notifies', async () => {
    const stamp = uuidv7().slice(0, 8);
    const staleTime = new Date(Date.now() - 50 * 60 * 60 * 1000);

    const { matchId } = await seedPendingMatch(`st-${stamp}`, staleTime);

    await POST(makeRequest(`Bearer ${Env.CRON_SECRET}`));

    const [result] = await db
      .select()
      .from(match_results)
      .where(eq(match_results.match_id, matchId));
    // Status stays pending — we do not auto-confirm
    expect(result.status).toBe('pending');
  });
});
