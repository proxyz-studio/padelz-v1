import { asc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { clubs, registrations, tournaments } from '@/models/Schema';
import {
  TournamentCard,
  type TournamentCardData,
} from '@/features/tournaments/components/TournamentCard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tournaments · Padel-Z',
};

export default async function TournamentsListPage() {
  let rows: TournamentCardData[] = [];
  let dbError = false;

  try {
    const now = new Date();
    rows = await db
      .select({
        slug: tournaments.slug,
        name: tournaments.name,
        format: tournaments.format,
        tournament_type: tournaments.tournament_type,
        start_at: tournaments.start_at,
        status: tournaments.status,
        tier_min: tournaments.tier_min,
        tier_max: tournaments.tier_max,
        club_name: clubs.name,
        club_slug: clubs.slug,
        registered_count: sql<number>`(
          SELECT COUNT(*)::int FROM ${registrations}
          WHERE ${registrations.tournament_id} = ${tournaments.id}
            AND ${registrations.status} = 'registered'
        )`,
      })
      .from(tournaments)
      .innerJoin(clubs, eq(clubs.id, tournaments.club_id))
      .where(gte(tournaments.start_at, now))
      .orderBy(asc(tournaments.start_at))
      .limit(40);
  } catch {
    dbError = true;
  }

  return (
    <div className="px-4 pb-8">
      <p className="m-0 max-w-[800px]">
        Tournaments hosted by Phuket clubs. Sign in to register; each
        tournament has a tier band — only players within the band can join.
      </p>
      <p className="m-0 mt-2 max-w-[800px] mute">
        Score-confirmed results feed the leaderboard nightly.
      </p>

      <div className="rule mt-20">
        <div className="grid grid-cols-[80px_1fr_280px_160px_64px_56px] gap-6 mute pt-6 pb-3">
          <span>Year</span>
          <span>Tournament</span>
          <span>Date · format · type · status · tier band</span>
          <span>Host</span>
          <span>Reg.</span>
          <span></span>
        </div>
      </div>

      {dbError ? (
        <div className="px-3 py-12 mute">
          Database unavailable. Foundation Week deployed the schema and
          read path; production credentials land before the Phuket pilot.
        </div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-12 mute">
          No upcoming tournaments. Clubs haven't scheduled any open
          tournaments yet — check back closer to the Phuket pilot launch in
          Q3 2026.
        </div>
      ) : (
        <table className="table">
          <colgroup>
            <col style={{ width: '80px' }} />
            <col />
            <col style={{ width: '280px' }} />
            <col style={{ width: '160px' }} />
            <col style={{ width: '64px' }} />
            <col className="arrow" />
          </colgroup>
          <tbody>
            {rows.map((t) => (
              <TournamentCard key={t.slug} t={t} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
