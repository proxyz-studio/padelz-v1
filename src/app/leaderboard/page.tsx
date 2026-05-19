import Link from 'next/link';
import { db } from '@/libs/DB';
import { players } from '@/models/Schema';
import { TierBadge } from '@/components/TierBadge';

export const dynamic = 'force-dynamic';

type Row = { handle: string; name: string; tier: string };

export const metadata = {
  title: 'Leaderboard · Padel-Z',
};

export default async function LeaderboardPage() {
  let rows: Row[] = [];
  let dbError = false;

  try {
    rows = await db
      .select({
        handle: players.handle,
        name: players.display_name,
        tier: players.tier,
      })
      .from(players)
      .limit(50);
  } catch {
    dbError = true;
  }

  return (
    <div className="px-4 pb-8">
      <p className="m-0 max-w-[800px]">
        Players ranked by cumulative points within their tier. Weeks at
        rank one accumulate toward auto-promotion.
      </p>
      <p className="m-0 mt-2 max-w-[800px] mute">
        Snapshots run nightly. Ties broken by match count, then
        registration order.
      </p>

      <div className="rule mt-20">
        <div className="grid grid-cols-[60px_1fr_280px_56px] gap-6 mute pt-6 pb-3">
          <span>Rank</span>
          <span>Player</span>
          <span>Tier</span>
          <span></span>
        </div>
      </div>

      {dbError ? (
        <div className="px-3 py-12 mute">
          Database unavailable. Foundation Week deployed the schema and
          read path; production credentials land before the Phuket pilot.
        </div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-12 mute">
          No active players yet. Registration opens with the first
          tournament. Sign in to be the first on the board.
        </div>
      ) : (
        <table className="table">
          <colgroup>
            <col style={{ width: '60px' }} />
            <col />
            <col style={{ width: '280px' }} />
            <col className="arrow" />
          </colgroup>
          <tbody>
            {rows.map((p, i) => {
              const rank = i + 1;
              const rankCls =
                rank === 1
                  ? 'pink font-bold tabular-nums no-underline'
                  : rank <= 3
                    ? 'fn-green font-bold tabular-nums no-underline'
                    : 'mute tabular-nums no-underline';
              return (
                <tr key={p.handle}>
                  <td className={rankCls}>{String(rank).padStart(2, '0')}</td>
                  <td>
                    <Link href={`/p/${p.handle}`} className="no-underline">
                      <span className="font-bold">{p.name}</span>{' '}
                      <span className="mute">@{p.handle}</span>
                    </Link>
                  </td>
                  <td className="mute">
                    <TierBadge tier={p.tier} />
                  </td>
                  <td className="arrow no-underline">
                    <Link href={`/p/${p.handle}`}>→</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="m-0 mt-8 mute tabular-nums">
        {String(rows.length).padStart(2, '0')} player
        {rows.length === 1 ? '' : 's'} ·{' '}
        <span className="pink font-bold">●</span> rank 1 ·{' '}
        <span className="fn-green font-bold">●</span> top 3
      </p>
    </div>
  );
}
