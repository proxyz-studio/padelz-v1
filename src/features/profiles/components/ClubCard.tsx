import type { PublicClub } from '../types';

/**
 * Public read-only club profile. Flat data record matching the niklas-style
 * single-spec discipline.
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
  const activeCount = activeTournamentCount ?? 0;

  return (
    <article>
      <div className="rule">
        <div className="grid grid-cols-[80px_1fr_280px_160px_56px] gap-6 mute pt-6 pb-3">
          <span>—</span>
          <span>Club</span>
          <span>City · courts · members</span>
          <span>Active tournaments</span>
          <span></span>
        </div>
      </div>

      <div className="grid grid-cols-[80px_1fr_280px_160px_56px] gap-6 items-baseline rule-bottom px-3 py-4">
        <span>—</span>
        <span>
          <span className="font-bold">{club.name}</span>{' '}
          <span className="mute">/c/{club.slug}</span>
        </span>
        <span className="mute">
          {club.city} ·{' '}
          {club.court_count !== null
            ? `${String(club.court_count).padStart(2, '0')} courts`
            : '— courts'}{' '}
          ·{' '}
          {memberCount !== undefined
            ? `${String(memberCount).padStart(2, '0')} members`
            : '—'}
        </span>
        <span className={activeCount > 0 ? 'fn-green font-bold' : 'mute'}>
          {String(activeCount).padStart(2, '0')}
        </span>
        <span></span>
      </div>

      {club.description ? (
        <p className="m-0 mt-12 max-w-[800px] px-3">{club.description}</p>
      ) : null}

      {monthYear ? (
        <p className="m-0 mt-12 px-3 mute">Founded {monthYear}.</p>
      ) : null}
    </article>
  );
}
