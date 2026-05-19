import Link from 'next/link';

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

const STATUS_STYLE: Record<string, string> = {
  draft: 'text-[var(--color-fg-faint)] border-[var(--color-fg-faint)]',
  open: 'text-[var(--color-pink)] border-[var(--color-pink)]',
  in_progress:
    'text-[var(--color-tier-gold)] border-[var(--color-tier-gold)]',
  complete:
    'text-[var(--color-fg-muted)] border-[var(--color-fg-muted)]',
};

export type TournamentCardData = {
  slug: string;
  name: string;
  format: string;
  tournament_type: string;
  start_at: Date;
  status: string;
  tier_min: string | null;
  tier_max: string | null;
  club_name: string;
  club_slug: string;
  registered_count: number;
};

export function TournamentCard({ t }: { t: TournamentCardData }) {
  const date = t.start_at.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = t.start_at.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const tierBand =
    t.tier_min || t.tier_max
      ? `${t.tier_min ?? 'any'} → ${t.tier_max ?? 'any'}`
      : 'All tiers';

  return (
    <Link
      href={`/t/${t.slug}`}
      className="group block border border-[var(--color-rule)] bg-[var(--color-bg)] p-6 transition-all duration-300 ease-out hover:-translate-y-1 hover:ring-1 hover:ring-inset hover:ring-[var(--color-pink)]/40"
    >
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--color-fg-muted)]">
          {TYPE_LABEL[t.tournament_type] ?? t.tournament_type} ·{' '}
          {FORMAT_LABEL[t.format] ?? t.format}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.22em] font-mono border px-2 py-0.5 ${
            STATUS_STYLE[t.status] ??
            'text-[var(--color-fg-muted)] border-[var(--color-fg-muted)]'
          }`}
        >
          {t.status}
        </span>
      </div>

      <h3 className="text-xl md:text-2xl font-light tracking-tight text-[var(--color-fg)] mb-2 group-hover:text-[var(--color-pink)] transition-colors">
        {t.name}
      </h3>

      <p className="text-sm text-[var(--color-fg-muted)] font-mono mb-6">
        @ {t.club_name}
      </p>

      <dl className="grid grid-cols-3 gap-px bg-[var(--color-rule)] border-y border-[var(--color-rule)]">
        <Field label="Date" value={date} />
        <Field label="Time" value={time} mono />
        <Field label="Tier band" value={tierBand} mono />
      </dl>

      <p className="mt-4 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono tabular-nums">
        {String(t.registered_count).padStart(2, '0')} registered
      </p>
    </Link>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-[var(--color-bg)] p-3 flex flex-col gap-1">
      <dt className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        {label}
      </dt>
      <dd className={`text-sm text-[var(--color-fg)] ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
