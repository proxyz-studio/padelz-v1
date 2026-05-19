import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { clubs, tournaments } from '@/models/Schema';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let upcoming: Array<{
    slug: string;
    name: string;
    start_at: Date;
    format: string;
    tournament_type: string;
    status: string;
    club_name: string;
    club_slug: string;
  }> = [];
  let dbError = false;
  try {
    upcoming = await db
      .select({
        slug: tournaments.slug,
        name: tournaments.name,
        start_at: tournaments.start_at,
        format: tournaments.format,
        tournament_type: tournaments.tournament_type,
        status: tournaments.status,
        club_name: clubs.name,
        club_slug: clubs.slug,
      })
      .from(tournaments)
      .innerJoin(clubs, eq(clubs.id, tournaments.club_id))
      .orderBy(desc(tournaments.start_at))
      .limit(20);
  } catch {
    dbError = true;
  }

  return (
    <div className="px-4 pb-8">
      <p className="m-0 max-w-[800px]">
        Phuket padel community by PROXYZ Studio, tracking match scores,
        tier progression, and tournament results across clubs since 2026.
      </p>
      <p className="m-0 mt-2 max-w-[800px] mute">
        Submit your scores · confirm opponents · the leaderboard updates
        nightly · auto-promote on four straight weeks at rank one.
      </p>

      <div className="rule mt-20 desktop-only">
        <div className="grid grid-cols-[80px_1fr_280px_160px_56px] gap-6 mute pt-6 pb-3">
          <span>Year</span>
          <span>Tournament</span>
          <span>Format · type · status</span>
          <span>Host</span>
          <span></span>
        </div>
      </div>
      <div className="rule mt-20 mobile-only"></div>

      {dbError ? (
        <div className="px-3 py-12 mute">
          Database unavailable. Foundation Week deployed the schema and
          read path; production credentials land before the Phuket pilot.
        </div>
      ) : upcoming.length === 0 ? (
        <div className="px-3 py-12 mute">
          No tournaments yet. The first Phuket Open lands soon.
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
                <col className="arrow" />
              </colgroup>
              <tbody>
                {upcoming.map((t) => {
                  const year = t.start_at.getUTCFullYear();
                  const statusCls =
                    t.status === 'open'
                      ? 'fn-green font-bold'
                      : t.status === 'in_progress'
                        ? 'fn-blue font-bold'
                        : t.status === 'complete'
                          ? 'mute'
                          : '';
                  return (
                    <tr key={t.slug}>
                      <td className="year no-underline">{year}</td>
                      <td>
                        <Link href={`/t/${t.slug}`} className="no-underline">
                          {t.name}
                        </Link>
                      </td>
                      <td className="mute">
                        {FORMAT_LABEL[t.format] ?? t.format} ·{' '}
                        {TYPE_LABEL[t.tournament_type] ?? t.tournament_type} ·{' '}
                        <span className={statusCls}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </td>
                      <td>
                        <Link href={`/c/${t.club_slug}`} className="mute no-underline">
                          {t.club_name}
                        </Link>
                      </td>
                      <td className="arrow no-underline">
                        <Link href={`/t/${t.slug}`}>→</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mobile-only">
            {upcoming.map((t) => {
              const year = t.start_at.getUTCFullYear();
              const statusCls =
                t.status === 'open'
                  ? 'fn-green font-bold'
                  : t.status === 'in_progress'
                    ? 'fn-blue font-bold'
                    : t.status === 'complete'
                      ? 'mute'
                      : '';
              return (
                <Link key={t.slug} href={`/t/${t.slug}`} className="no-underline" style={{ display: 'block', padding: '16px 0', borderBottom: '1px solid var(--color-rule)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
                    <strong>{t.name}</strong>
                    <span className={statusCls} style={{ fontSize: 14 }}>{STATUS_LABEL[t.status] ?? t.status}</span>
                  </div>
                  <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>
                    {year} · {FORMAT_LABEL[t.format] ?? t.format} · {TYPE_LABEL[t.tournament_type] ?? t.tournament_type}
                  </div>
                  <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>
                    {t.start_at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {t.club_name}
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

const FORMAT_LABEL: Record<string, string> = {
  americano: 'Americano',
  mexicano: 'Mexicano',
  round_robin: 'Round-robin',
  bracket: 'Bracket',
};
const TYPE_LABEL: Record<string, string> = {
  open: 'Open',
  club_internal: 'Club',
  group: 'Group',
  casual: 'Casual',
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  in_progress: 'In progress',
  complete: 'Complete',
};
