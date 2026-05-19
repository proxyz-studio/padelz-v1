import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq, and } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  clubs,
  players,
  registrations,
  tournaments,
} from '@/models/Schema';
import { TierBadge } from '@/components/TierBadge';

export const dynamic = 'force-dynamic';

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return { title: `${slug} · Padel-Z` };
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

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;

  let row:
    | (typeof tournaments.$inferSelect & {
        club_name: string;
        club_slug: string;
      })
    | undefined;
  let roster: Array<{
    handle: string;
    display_name: string;
    tier: string;
  }> = [];
  let dbError: string | null = null;

  try {
    const [t] = await db
      .select({
        id: tournaments.id,
        slug: tournaments.slug,
        club_id: tournaments.club_id,
        name: tournaments.name,
        format: tournaments.format,
        tournament_type: tournaments.tournament_type,
        start_at: tournaments.start_at,
        tier_min: tournaments.tier_min,
        tier_max: tournaments.tier_max,
        status: tournaments.status,
        created_by: tournaments.created_by,
        created_at: tournaments.created_at,
        club_name: clubs.name,
        club_slug: clubs.slug,
      })
      .from(tournaments)
      .innerJoin(clubs, eq(clubs.id, tournaments.club_id))
      .where(eq(tournaments.slug, slug))
      .limit(1);

    if (t) {
      row = t;
      roster = await db
        .select({
          handle: players.handle,
          display_name: players.display_name,
          tier: players.tier,
        })
        .from(registrations)
        .innerJoin(players, eq(players.id, registrations.player_id))
        .where(
          and(
            eq(registrations.tournament_id, t.id),
            eq(registrations.status, 'registered'),
          ),
        )
        .limit(64);
    }
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  if (dbError) {
    return (
      <div className="mx-auto max-w-3xl px-6 pt-16 pb-24">
        <header className="border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
          § Tournament · /t/{slug}
        </header>
        <div className="mt-16 border border-dashed border-[var(--color-rule)] px-6 md:px-10 py-16 text-center">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] mb-5 font-mono">
            Database unavailable
          </p>
          <h2 className="text-2xl font-light mb-4 tracking-tight">
            Tournament page temporarily offline
          </h2>
          <p className="text-sm text-[var(--color-fg-muted)] max-w-md mx-auto leading-relaxed">
            Foundation Week deployed the schema and read path; production
            credentials land before the Phuket pilot.
          </p>
        </div>
      </div>
    );
  }

  if (!row) {
    notFound();
  }

  const date = row.start_at.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = row.start_at.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const tierBand =
    row.tier_min || row.tier_max
      ? `${row.tier_min ?? 'any'} → ${row.tier_max ?? 'any'}`
      : 'All tiers';

  return (
    <div className="mx-auto max-w-4xl px-6 pt-10 pb-24">
      <header className="flex items-center justify-between border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        <Link href="/t" className="hover:text-[var(--color-fg)]">
          ← Tournaments
        </Link>
        <span>/t/{row.slug}</span>
      </header>

      <div className="mt-12 grid grid-cols-12 gap-6 md:gap-10">
        <div className="col-span-12 md:col-span-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-pink)] mb-4 font-mono">
            {TYPE_LABEL[row.tournament_type] ?? row.tournament_type} ·{' '}
            {FORMAT_LABEL[row.format] ?? row.format}
          </p>
          <h1 className="text-4xl md:text-6xl font-light leading-[1.05] tracking-tight">
            {row.name}
          </h1>
          <p className="mt-6 text-base text-[var(--color-fg-muted)] font-mono">
            Hosted by{' '}
            <Link
              href={`/c/${row.club_slug}`}
              className="text-[var(--color-fg)] hover:text-[var(--color-pink)] transition-colors"
            >
              {row.club_name}
            </Link>
          </p>

          {/* Register CTA — placeholder until M2 Task 4.3 ships registerForTournament */}
          <div className="mt-10 border border-dashed border-[var(--color-rule)] p-5">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono mb-2">
              Registration
            </p>
            <p className="text-sm text-[var(--color-fg)]">
              <Link
                href="/sign-in"
                className="text-[var(--color-pink)] hover:opacity-80"
              >
                Sign in to register
              </Link>
              <span className="text-[var(--color-fg-muted)]">
                {' '}
                · interactive flow lands with M2 scoring milestone
              </span>
            </p>
          </div>
        </div>

        <aside className="col-span-12 md:col-span-4 md:border-l md:border-[var(--color-rule)] md:pl-6 mt-6 md:mt-0">
          <h2 className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-6 font-mono">
            Details
          </h2>
          <dl className="space-y-3">
            <Stat label="Date" value={date} />
            <Stat label="Time" value={time} mono />
            <Stat label="Tier band" value={tierBand} mono />
            <Stat label="Status" value={row.status} mono />
            <Stat
              label="Registered"
              value={`${String(roster.length).padStart(2, '0')}`}
              mono
            />
          </dl>
        </aside>
      </div>

      <section className="mt-24">
        <div className="flex items-baseline justify-between mb-8 border-b border-[var(--color-rule)] pb-3">
          <h2 className="text-2xl md:text-3xl font-light tracking-tight">
            Roster
          </h2>
          <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono tabular-nums">
            {String(roster.length).padStart(2, '0')} players
          </span>
        </div>
        {roster.length === 0 ? (
          <div className="border border-dashed border-[var(--color-rule)] px-6 py-12 text-center">
            <p className="text-sm text-[var(--color-fg-muted)] leading-relaxed">
              No players registered yet — be the first.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono border-b border-[var(--color-rule)]">
                <th className="py-3 pr-4 w-10 font-normal">#</th>
                <th className="py-3 pr-4 font-normal">Handle</th>
                <th className="py-3 pr-4 font-normal hidden md:table-cell">
                  Display name
                </th>
                <th className="py-3 pr-4 font-normal w-28">Tier</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p, i) => (
                <tr
                  key={p.handle}
                  className="border-b border-[var(--color-rule)] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-3 pr-4 text-[var(--color-fg-muted)] tabular-nums font-mono">
                    {String(i + 1).padStart(2, '0')}
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    <Link
                      href={`/p/${p.handle}`}
                      className="text-[var(--color-fg)] hover:text-[var(--color-pink)] transition-colors"
                    >
                      {p.handle}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-[var(--color-fg-muted)] hidden md:table-cell">
                    {p.display_name}
                  </td>
                  <td className="py-3 pr-4">
                    <TierBadge tier={p.tier} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-[var(--color-rule)] pb-3 last:border-b-0 last:pb-0">
      <dt className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        {label}
      </dt>
      <dd
        className={`text-sm text-[var(--color-fg)] ${
          mono ? 'font-mono capitalize' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
