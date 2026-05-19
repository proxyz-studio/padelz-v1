import { db } from '@/libs/DB';
import { players } from '@/models/Schema';
import { TierBadge } from '@/components/TierBadge';
import { AnimatedSection } from '@/components/AnimatedSection';

// Always render per-request — leaderboard data is live and changes as scores land.
// Also avoids hitting the DB at build time (which fails when DATABASE_URL is a stub).
export const dynamic = 'force-dynamic';

type Row = { handle: string; name: string; tier: string };

export default async function LeaderboardPage() {
  let rows: Row[] = [];
  let dbError: string | null = null;

  try {
    rows = await db
      .select({
        handle: players.handle,
        name: players.display_name,
        tier: players.tier,
      })
      .from(players)
      .limit(50);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pt-10 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        <span>§ Leaderboard</span>
        <span>All tiers · Current month</span>
      </header>

      <AnimatedSection className="mt-16 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-light leading-[0.9] tracking-tight">
          Leader<span className="text-[var(--color-pink)]">board</span>
        </h1>
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] tabular-nums font-mono">
          {dbError
            ? '—'
            : `${String(rows.length).padStart(2, '0')} player${rows.length === 1 ? '' : 's'}`}
        </span>
      </AnimatedSection>

      <AnimatedSection delay={0.1}>
        <p className="mt-6 max-w-2xl text-sm md:text-base text-[var(--color-fg-muted)] leading-relaxed">
          Players ranked by cumulative points within their tier. Weeks at rank
          one accumulate toward auto-promotion. Snapshots run nightly. Ties
          broken by match count, then registration order.
        </p>
      </AnimatedSection>

      <AnimatedSection delay={0.2} className="mt-16">
        {dbError ? (
          <EmptyState
            heading="Leaderboard temporarily unavailable"
            note="The production database isn't wired yet. Foundation Week deployed the schema and the read path; production credentials land before the Phuket pilot."
            code={dbError.split('\n')[0].slice(0, 110)}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            heading="No active players yet"
            note="Registration opens with the first tournament. Sign in to be the first on the board."
          />
        ) : (
          <div className="border-t border-[var(--color-rule)]">
            <table className="w-full text-sm md:text-base">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
                  <th className="py-4 pr-4 w-14 font-normal">Rank</th>
                  <th className="py-4 pr-4 font-normal">Handle</th>
                  <th className="py-4 pr-4 font-normal hidden md:table-cell">
                    Display name
                  </th>
                  <th className="py-4 pr-4 font-normal w-28 text-right md:text-left">
                    Tier
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr
                    key={p.handle}
                    className="border-t border-[var(--color-rule)] hover:bg-white/[0.025] transition-colors"
                  >
                    <td className="py-4 pr-4 text-[var(--color-fg-muted)] tabular-nums font-mono">
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td className="py-4 pr-4 text-[var(--color-fg)] font-mono">
                      {p.handle}
                    </td>
                    <td className="py-4 pr-4 text-[var(--color-fg-muted)] hidden md:table-cell">
                      {p.name}
                    </td>
                    <td className="py-4 pr-4 text-right md:text-left">
                      <TierBadge tier={p.tier} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnimatedSection>
    </div>
  );
}

function EmptyState({
  heading,
  note,
  code,
}: {
  heading: string;
  note: string;
  code?: string;
}) {
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
      {code ? (
        <pre className="mt-8 inline-block max-w-full overflow-x-auto border-l-2 border-[var(--color-pink-dim)] pl-3 text-left text-[11px] text-[var(--color-fg-muted)] font-mono">
          <code>{code}</code>
        </pre>
      ) : null}
    </div>
  );
}
