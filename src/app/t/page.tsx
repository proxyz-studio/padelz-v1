import Link from 'next/link';
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

      <div className="rule mt-20 desktop-only">
        <div className="grid grid-cols-[80px_1fr_280px_160px_64px_56px] gap-6 mute pt-6 pb-3">
          <span>Year</span>
          <span>Tournament</span>
          <span>Date · format · type · status · tier band</span>
          <span>Host</span>
          <span>Reg.</span>
          <span></span>
        </div>
      </div>
      <div className="rule mt-20 mobile-only"></div>

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
        <>
          <div className="desktop-only">
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
          </div>

          <div className="mobile-only">
            {rows.map((t) => {
              const year = t.start_at.getUTCFullYear();
              const tierBand =
                t.tier_min || t.tier_max
                  ? `${t.tier_min ?? 'any'} → ${t.tier_max ?? 'any'}`
                  : 'All tiers';
              const statusCls =
                t.status === 'open'
                  ? 'fn-green font-bold'
                  : t.status === 'in_progress'
                    ? 'fn-blue font-bold'
                    : 'mute';
              const date = t.start_at.toLocaleDateString('en-US', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              });
              return (
                <Link key={t.slug} href={`/t/${t.slug}`} className="no-underline" style={{ display: 'block', padding: '16px 0', borderBottom: '1px solid var(--color-rule)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
                    <strong>{t.name}</strong>
                    <span className={statusCls} style={{ fontSize: 14 }}>{t.status.replace('_', ' ')}</span>
                  </div>
                  <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>
                    {year} · {t.format} · {t.tournament_type}
                  </div>
                  <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>
                    {date} · {t.club_name}
                  </div>
                  <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>
                    {tierBand}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
