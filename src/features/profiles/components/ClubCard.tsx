import type { PublicClub } from '../types';

/**
 * Public read-only club profile card. PROXYZ console-editorial styling.
 * Mirrors PlayerProfileCard shape — handle (slug) + name + tier-like badge
 * (admin/club marker), data grid, optional description.
 */
export function ClubCard({
  club,
  memberCount,
  activeTournamentCount,
  founded,
}: {
  club: PublicClub;
  memberCount?: number;
  activeTournamentCount?: number;
  founded?: Date;
}) {
  const monthYear = founded
    ? founded.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <article className="border border-[var(--color-rule)] bg-[var(--color-bg)] p-6 md:p-8 max-w-2xl">
      <header className="flex items-start gap-4 md:gap-6 mb-6">
        {club.photo_url ? (
          <img
            src={club.photo_url}
            alt=""
            className="w-20 h-20 md:w-24 md:h-24 border border-[var(--color-rule)] object-cover"
          />
        ) : (
          <div className="w-20 h-20 md:w-24 md:h-24 border border-[var(--color-rule)] bg-[var(--color-bg-elevated)] flex items-center justify-center">
            <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-faint)] font-mono">
              club
            </span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-light tracking-tight text-[var(--color-fg)] break-words">
            {club.name}
          </h1>
          <p className="mt-1 text-[var(--color-fg-muted)] font-mono text-sm">
            /c/{club.slug}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 border border-[var(--color-rule)] px-2 py-0.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--color-fg-muted)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-pink)]" />
              {club.city}
            </span>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--color-rule)] border-y border-[var(--color-rule)]">
        <Field
          label="Courts"
          value={
            club.court_count !== null
              ? String(club.court_count).padStart(2, '0')
              : '—'
          }
          mono
        />
        <Field
          label="Members"
          value={
            memberCount !== undefined
              ? String(memberCount).padStart(2, '0')
              : '—'
          }
          mono
        />
        <Field
          label="Active tournaments"
          value={
            activeTournamentCount !== undefined
              ? String(activeTournamentCount).padStart(2, '0')
              : '—'
          }
          mono
        />
        <Field label="Founded" value={monthYear ?? '—'} />
      </dl>

      {club.description ? (
        <p className="mt-6 text-sm md:text-base text-[var(--color-fg)] leading-relaxed">
          {club.description}
        </p>
      ) : null}
    </article>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="bg-[var(--color-bg)] p-4 flex flex-col gap-1">
      <dt className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        {label}
      </dt>
      <dd
        className={`text-sm text-[var(--color-fg)] ${
          mono ? 'font-mono tabular-nums' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
