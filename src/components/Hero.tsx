import Link from 'next/link';
import { CourtDiagram } from './CourtDiagram';

const STATS = [
  ['Tables migrated', '13'],
  ['Tier system', 'bronze → platinum'],
  ['Modules', 'M1–M4 · scaffolded'],
  ['Pilot start', 'Q3 2026'],
  ['Source', 'proxyz-studio/padelz-v1'],
] as const;

export function Hero({ today }: { today: string }) {
  return (
    <div className="relative">
      {/* Masthead strip */}
      <div className="anim-fade-in flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        <span>Vol. 01 · Issue 00</span>
        <span className="hidden md:inline">Foundation Week</span>
        <span>Phuket, TH · {today}</span>
      </div>

      {/* Court watermark */}
      <div className="pointer-events-none absolute -right-12 top-12 hidden lg:block">
        <CourtDiagram className="h-48 w-96 text-[var(--color-fg-faint)] opacity-40" />
      </div>

      <section className="relative grid grid-cols-12 gap-6 md:gap-10 mt-16 md:mt-24">
        <div className="col-span-12 md:col-span-8">
          <p
            className="anim-fade-up text-[10px] uppercase tracking-[0.3em] text-[var(--color-pink)] mb-6 font-mono"
            style={{ animationDelay: '60ms' }}
          >
            An installation by PROXYZ Studio
          </p>

          <h1
            className="anim-fade-up-blur text-7xl md:text-9xl lg:text-[10rem] font-mono font-light leading-[0.9] tracking-tight"
            style={{ animationDelay: '180ms' }}
          >
            PADEL<span className="text-[var(--color-pink)]">-</span>Z
          </h1>

          <p
            className="anim-fade-up mt-10 max-w-xl text-base md:text-lg leading-relaxed text-[var(--color-fg)]"
            style={{ animationDelay: '420ms' }}
          >
            A community platform for Phuket&apos;s growing padel scene. Tournaments,
            leaderboards, two-player score confirmation, tier promotion.{' '}
            <span className="text-[var(--color-pink)]">Built lean.</span> Free for
            clubs and players.
          </p>

          <div
            className="anim-fade-up mt-12 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] font-mono"
            style={{ animationDelay: '600ms' }}
          >
            <Link
              href="/leaderboard"
              className="group inline-flex items-center gap-2 border border-[var(--color-pink)] bg-[var(--color-pink)] text-[var(--color-bg)] px-5 py-3 hover:bg-transparent hover:text-[var(--color-pink)] transition-colors"
            >
              <span>View Leaderboard</span>
              <span className="inline-block transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 border border-[var(--color-fg-muted)] text-[var(--color-fg-muted)] px-5 py-3 hover:border-[var(--color-fg)] hover:text-[var(--color-fg)] transition-colors"
            >
              Register as a player
            </Link>
          </div>
        </div>

        <aside
          className="anim-fade-up col-span-12 md:col-span-4 md:border-l md:border-[var(--color-rule)] md:pl-6 mt-6 md:mt-0"
          style={{ animationDelay: '720ms' }}
        >
          <h2 className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-6 font-mono">
            System status
          </h2>
          <dl className="space-y-3">
            {STATS.map(([label, value], i) => {
              const muted = label === 'Source';
              return (
                <div
                  key={label}
                  className="anim-fade-up flex flex-col gap-1 border-b border-[var(--color-rule)] pb-3 last:border-b-0 last:pb-0"
                  style={{ animationDelay: `${800 + i * 80}ms` }}
                >
                  <dt className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
                    {label}
                  </dt>
                  <dd
                    className={`text-sm font-mono ${
                      muted
                        ? 'text-[var(--color-fg-muted)] break-all'
                        : 'text-[var(--color-fg)]'
                    }`}
                  >
                    {value}
                  </dd>
                </div>
              );
            })}
          </dl>
        </aside>
      </section>
    </div>
  );
}
