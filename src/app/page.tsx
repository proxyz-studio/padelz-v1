import Link from 'next/link';

export default function HomePage() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl px-6 pt-10 pb-24">
      {/* Masthead — newspaper edition strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
        <span>Vol. 01 · Issue 00</span>
        <span className="hidden md:inline">Foundation Week</span>
        <span>Phuket, TH · {today}</span>
      </div>

      {/* Hero */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 mt-16 md:mt-24">
        <div className="col-span-12 md:col-span-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-pink)] mb-6">
            An installation by PROXYZ Studio
          </p>
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-light leading-[0.9] tracking-tight">
            PADEL<span className="text-[var(--color-pink)]">-</span>Z
          </h1>
          <p className="mt-10 max-w-xl text-base md:text-lg leading-relaxed text-[var(--color-fg)]">
            A community platform for Phuket&apos;s growing padel scene. Tournaments,
            leaderboards, two-player score confirmation, tier promotion. Built lean.
            Free for clubs and players.
          </p>
          <div className="mt-12 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em]">
            <Link
              href="/leaderboard"
              className="border border-[var(--color-pink)] bg-[var(--color-pink)] text-[var(--color-bg)] px-5 py-3 hover:bg-transparent hover:text-[var(--color-pink)] transition-colors"
            >
              View Leaderboard →
            </Link>
            <Link
              href="/sign-in"
              className="border border-[var(--color-fg-muted)] text-[var(--color-fg-muted)] px-5 py-3 hover:border-[var(--color-fg)] hover:text-[var(--color-fg)] transition-colors"
            >
              Register as a player
            </Link>
          </div>
        </div>

        <aside className="col-span-12 md:col-span-4 md:border-l md:border-[var(--color-rule)] md:pl-6 mt-6 md:mt-0">
          <h2 className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-6">
            System status
          </h2>
          <dl className="space-y-3">
            <Stat label="Tables migrated" value="13" />
            <Stat label="Tier system" value="bronze → platinum" />
            <Stat label="Modules" value="M1–M4 · scaffolded" />
            <Stat label="Pilot start" value="Q3 2026" />
            <Stat label="Source" value="proxyz-studio/padelz-v1" muted />
          </dl>
        </aside>
      </section>

      {/* Manifesto */}
      <section className="mt-32 grid grid-cols-12 gap-6 border-y border-[var(--color-rule)] py-12">
        <div className="col-span-12 md:col-span-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            § 01 · Premise
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 text-base md:text-lg leading-relaxed">
          <p className="text-[var(--color-fg)]">
            Padel-Z is the bare core loop. Create tournament, register players, submit
            scores with two-player confirmation, leaderboard recomputes nightly, tiers
            auto-promote on cumulative weeks at rank one. No groups, no marketplace, no
            video, no comments. Those land <em className="not-italic text-[var(--color-pink)]">after</em>{' '}
            the Phuket pilot proves the loop is worth keeping.
          </p>
        </div>
      </section>

      {/* Roadmap */}
      <section className="mt-24">
        <div className="flex items-baseline justify-between mb-8 border-b border-[var(--color-rule)] pb-3">
          <h2 className="text-2xl md:text-3xl font-light tracking-tight">Roadmap</h2>
          <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Q2 – Q3 2026
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--color-rule)]">
          <Module
            index="M1"
            title="Identity"
            status="active"
            lines={[
              'Auth · Clerk webhook',
              'Profiles · /p/[handle]',
              'Notifications fan-out',
            ]}
          />
          <Module
            index="M2"
            title="Tournaments"
            status="queued"
            lines={[
              'Create + register',
              'Bracket generation',
              'Status state machine',
            ]}
          />
          <Module
            index="M3"
            title="Scoring"
            status="queued"
            lines={[
              'Two-player confirm',
              'roundHalfUp ledger',
              'Admin override + void',
            ]}
          />
          <Module
            index="M4"
            title="Leaderboard"
            status="queued"
            lines={[
              'Cron snapshot',
              'Auto-promote on rank 1',
              'Tier-filtered views',
            ]}
          />
        </div>
      </section>

      {/* Foundation receipts */}
      <section className="mt-24 border-t border-[var(--color-rule)] pt-12">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              § 02 · Receipts
            </p>
          </div>
          <div className="col-span-12 md:col-span-9 grid grid-cols-2 md:grid-cols-4 gap-6">
            <Receipt n="13" label="Drizzle tables" />
            <Receipt n="04" label="Tier levels" />
            <Receipt n="07" label="Notification types" />
            <Receipt n="22" label="Tests · 20 unit / 2 integ" />
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-[var(--color-rule)] pb-3 last:border-b-0 last:pb-0">
      <dt className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
        {label}
      </dt>
      <dd
        className={`text-sm ${
          muted
            ? 'text-[var(--color-fg-muted)] break-all'
            : 'text-[var(--color-fg)]'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Module({
  index,
  title,
  status,
  lines,
}: {
  index: string;
  title: string;
  status: 'active' | 'queued';
  lines: string[];
}) {
  return (
    <div className="bg-[var(--color-bg)] p-6 flex flex-col gap-4 min-h-[180px]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
          {index}
        </span>
        <span
          className={`text-[10px] uppercase tracking-[0.22em] ${
            status === 'active'
              ? 'text-[var(--color-pink)]'
              : 'text-[var(--color-fg-faint)]'
          }`}
        >
          {status === 'active' ? '● Active' : '○ Queued'}
        </span>
      </div>
      <h3 className="text-xl font-light tracking-tight">{title}</h3>
      <ul className="space-y-1 text-xs text-[var(--color-fg-muted)] leading-relaxed">
        {lines.map((l) => (
          <li key={l}>· {l}</li>
        ))}
      </ul>
    </div>
  );
}

function Receipt({ n, label }: { n: string; label: string }) {
  return (
    <div className="border-t border-[var(--color-fg-faint)] pt-3">
      <p className="text-3xl md:text-4xl font-light tabular-nums tracking-tight text-[var(--color-fg)]">
        {n}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
        {label}
      </p>
    </div>
  );
}
