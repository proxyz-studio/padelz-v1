import type { PublicPlayer } from '../types';
import { TierBadge } from '@/components/TierBadge';

/**
 * Public read-only player profile card. PROXYZ console-editorial styling.
 * Honors redacted_at — when set, the card shows [deleted] and hides photo + bio
 * per the M1 webhook soft-delete policy.
 */
export function PlayerProfileCard({
  player,
  bio,
  homeClubName,
  memberSince,
}: {
  player: PublicPlayer;
  bio?: string | null;
  homeClubName?: string | null;
  memberSince?: Date;
}) {
  const isRedacted = player.redacted_at !== null;
  const monthYear = memberSince
    ? memberSince.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <article className="border border-[var(--color-rule)] bg-[var(--color-bg)] p-6 md:p-8 max-w-2xl">
      <header className="flex items-start gap-4 md:gap-6 mb-6">
        {player.photo_url && !isRedacted ? (
          <img
            src={player.photo_url}
            alt=""
            className="w-20 h-20 md:w-24 md:h-24 border border-[var(--color-rule)] object-cover"
          />
        ) : (
          <div className="w-20 h-20 md:w-24 md:h-24 border border-[var(--color-rule)] bg-[var(--color-bg-elevated)] flex items-center justify-center">
            <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-faint)] font-mono">
              {isRedacted ? '[del]' : 'no photo'}
            </span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-light tracking-tight text-[var(--color-fg)] break-words">
            {player.display_name}
          </h1>
          <p className="mt-1 text-[var(--color-fg-muted)] font-mono text-sm">
            @{player.handle}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <TierBadge tier={player.tier} />
            {player.verified && !isRedacted ? (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--color-pink)]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-pink)]" />
                Verified
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[var(--color-rule)] border-y border-[var(--color-rule)]">
        <Field
          label="Tier"
          value={
            <span className="capitalize">{player.tier}</span>
          }
        />
        <Field label="Home club" value={homeClubName ?? '—'} />
        <Field label="Member since" value={monthYear ?? '—'} />
      </dl>

      {bio && !isRedacted ? (
        <p className="mt-6 text-sm md:text-base text-[var(--color-fg)] leading-relaxed">
          {bio}
        </p>
      ) : null}

      {isRedacted ? (
        <p className="mt-6 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
          § Account redacted · match history preserved
        </p>
      ) : null}
    </article>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-bg)] p-4 flex flex-col gap-1">
      <dt className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        {label}
      </dt>
      <dd className="text-sm text-[var(--color-fg)]">{value}</dd>
    </div>
  );
}
