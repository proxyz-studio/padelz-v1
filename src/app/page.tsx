import { Hero } from '@/components/Hero';
import { AnimatedSection } from '@/components/AnimatedSection';
import { ModuleCard } from '@/components/ModuleCard';
import { CountUp } from '@/components/CountUp';

export default function HomePage() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl px-6 pt-10 pb-24">
      <Hero today={today} />

      {/* Manifesto */}
      <AnimatedSection className="mt-32 grid grid-cols-12 gap-6 border-y border-[var(--color-rule)] py-12">
        <div className="col-span-12 md:col-span-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
            § 01 · Premise
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 text-base md:text-lg leading-relaxed">
          <p className="text-[var(--color-fg)]">
            Padel-Z is the bare core loop. Create tournament, register players,
            submit scores with two-player confirmation, leaderboard recomputes
            nightly, tiers auto-promote on cumulative weeks at rank one. No
            groups, no marketplace, no video, no comments. Those land{' '}
            <em className="not-italic text-[var(--color-pink)]">after</em> the
            Phuket pilot proves the loop is worth keeping.
          </p>
        </div>
      </AnimatedSection>

      {/* Roadmap */}
      <AnimatedSection className="mt-24">
        <div className="flex items-baseline justify-between mb-8 border-b border-[var(--color-rule)] pb-3">
          <h2 className="text-2xl md:text-3xl font-light tracking-tight">
            Roadmap
          </h2>
          <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
            Q2 – Q3 2026
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--color-rule)]">
          <ModuleCard
            index="M1"
            title="Identity"
            status="active"
            lines={[
              'Auth · Clerk webhook',
              'Profiles · /p/[handle]',
              'Notifications fan-out',
            ]}
            delay={0}
          />
          <ModuleCard
            index="M2"
            title="Tournaments"
            status="queued"
            lines={[
              'Create + register',
              'Bracket generation',
              'Status state machine',
            ]}
            delay={0.08}
          />
          <ModuleCard
            index="M3"
            title="Scoring"
            status="queued"
            lines={[
              'Two-player confirm',
              'roundHalfUp ledger',
              'Admin override + void',
            ]}
            delay={0.16}
          />
          <ModuleCard
            index="M4"
            title="Leaderboard"
            status="queued"
            lines={[
              'Cron snapshot',
              'Auto-promote on rank 1',
              'Tier-filtered views',
            ]}
            delay={0.24}
          />
        </div>
      </AnimatedSection>

      {/* Foundation receipts */}
      <AnimatedSection className="mt-24 border-t border-[var(--color-rule)] pt-12">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
              § 02 · Receipts
            </p>
          </div>
          <div className="col-span-12 md:col-span-9 grid grid-cols-2 md:grid-cols-4 gap-6">
            <Receipt target={13} label="Drizzle tables" />
            <Receipt target={4} label="Tier levels" />
            <Receipt target={7} label="Notification types" />
            <Receipt target={22} label="Tests · 20 unit / 2 integ" />
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}

function Receipt({ target, label }: { target: number; label: string }) {
  return (
    <div className="border-t border-[var(--color-fg-faint)] pt-3">
      <p className="text-3xl md:text-5xl font-light tabular-nums tracking-tight text-[var(--color-fg)]">
        <CountUp target={target} pad={2} />
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        {label}
      </p>
    </div>
  );
}
