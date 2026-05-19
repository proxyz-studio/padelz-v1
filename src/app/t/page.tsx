import { asc, count, eq, gte, sql } from 'drizzle-orm';
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
  let dbError: string | null = null;

  try {
    const now = new Date();
    // Upcoming + active — drop completed / past tournaments.
    // Aggregate registrations per tournament via a correlated count.
    const result = await db
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

    rows = result;
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pt-10 pb-24">
      <header className="flex items-center justify-between border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        <span>§ Tournaments</span>
        <span>Upcoming · Open registration</span>
      </header>

      <div className="mt-16 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-light leading-[0.9] tracking-tight">
          Tourna<span className="text-[var(--color-pink)]">ments</span>
        </h1>
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono tabular-nums">
          {dbError
            ? '—'
            : `${String(rows.length).padStart(2, '0')} upcoming`}
        </span>
      </div>

      <p className="mt-6 max-w-2xl text-sm md:text-base text-[var(--color-fg-muted)] leading-relaxed">
        Tournaments hosted by Phuket clubs. Sign in to register; each tournament
        has a tier band — only players within the band can join. Score-confirmed
        results feed the leaderboard nightly.
      </p>

      <div className="mt-16">
        {dbError ? (
          <EmptyState
            heading="Tournaments temporarily unavailable"
            note="The production database isn't wired yet. Foundation Week deployed the schema and read path; production credentials land before the Phuket pilot."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            heading="No upcoming tournaments"
            note="Clubs haven't scheduled any open tournaments yet. Check back closer to the Phuket pilot launch in Q3 2026."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rows.map((t) => (
              <TournamentCard key={t.slug} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ heading, note }: { heading: string; note: string }) {
  return (
    <div className="border border-dashed border-[var(--color-rule)] px-6 md:px-10 py-16 text-center">
      <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] mb-5 font-mono">
        No data
      </p>
      <h2 className="text-2xl md:text-3xl font-light mb-4 tracking-tight">
        {heading}
      </h2>
      <p className="text-sm md:text-base text-[var(--color-fg-muted)] max-w-xl mx-auto leading-relaxed">
        {note}
      </p>
    </div>
  );
}
