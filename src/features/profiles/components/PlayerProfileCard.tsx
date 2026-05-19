import type { PublicPlayer } from '../types';
import { TierBadge } from '@/components/TierBadge';

/**
 * Public read-only player profile. Flat data record matching the niklas-style
 * single-spec discipline — 24px Inter throughout, hairline rules between
 * fields, color used only when functional.
 *
 * Honors redacted_at — when set, shows "[redacted]" and hides bio per the
 * M1 webhook soft-delete policy.
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
    <article>
      <div className="rule">
        <div className="grid grid-cols-[80px_1fr_280px_160px_56px] gap-6 mute pt-6 pb-3">
          <span>—</span>
          <span>Player</span>
          <span>Home club · tier</span>
          <span>Member since</span>
          <span></span>
        </div>
      </div>

      <div className="grid grid-cols-[80px_1fr_280px_160px_56px] gap-6 items-baseline rule-bottom px-3 py-4">
        <span>—</span>
        <span>
          {isRedacted ? (
            <span className="mute">[redacted]</span>
          ) : (
            <>
              <span className="font-bold">{player.display_name}</span>{' '}
              <span className="mute">@{player.handle}</span>
              {player.verified ? (
                <>
                  {' '}
                  <span className="pink font-bold">· verified</span>
                </>
              ) : null}
            </>
          )}
        </span>
        <span className="mute">
          {homeClubName ?? 'no home club'} ·{' '}
          <TierBadge tier={player.tier} />
        </span>
        <span className="mute">{monthYear ?? '—'}</span>
        <span></span>
      </div>

      {bio && !isRedacted ? (
        <p className="m-0 mt-12 max-w-[800px] px-3">{bio}</p>
      ) : null}

      {isRedacted ? (
        <p className="m-0 mt-12 px-3 mute">
          Account redacted · match history preserved.
        </p>
      ) : null}
    </article>
  );
}
