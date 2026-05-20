// src/features/profiles/components/PointsHistory.tsx
import Link from 'next/link';
import type { PointsHistoryEntry } from '@/features/profiles/actions';

function formatDate(d: Date): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);
  if (days < 7) {
    if (days < 1) return 'today';
    const rounded = Math.round(days);
    return rounded === 1 ? 'yesterday' : `${rounded} days ago`;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PointsHistory({ entries }: { entries: PointsHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="mute" style={{ marginTop: '2em' }}>
        No points history yet. Play a tournament to start earning.
      </p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <table className="table desktop-only" style={{ marginTop: '1.5em' }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Change</th>
            <th>Running total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const isGain = e.points > 0;
            const verb = isGain ? 'Earned' : 'Lost';
            return (
              <tr key={e.id}>
                <td className="mute">{formatDate(e.earned_at)}</td>
                <td>
                  {verb} in{' '}
                  <Link href={`/t/${e.tournament_slug}`}>{e.tournament_name}</Link>{' '}
                  vs <Link href={`/p/${e.opponent_handle}`}>{e.opponent_handle}</Link>
                </td>
                <td className={isGain ? 'fn-green font-bold' : 'fn-red font-bold'}>
                  {isGain ? '+' : ''}{e.points}
                </td>
                <td>{e.running_total}</td>
                <td style={{ textAlign: 'right', width: '56px' }}>
                  <Link href={`/match/${e.match_id}`} className="btn-link">→</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile card variant */}
      <div className="mobile-only" style={{ marginTop: '1.5em' }}>
        {entries.map((e) => {
          const isGain = e.points > 0;
          const verb = isGain ? 'Earned' : 'Lost';
          return (
            <div key={e.id} className="rule-bottom" style={{ padding: '0.75em 0' }}>
              <p className="mute" style={{ fontSize: '0.85em' }}>{formatDate(e.earned_at)}</p>
              <p>
                {verb} in{' '}
                <Link href={`/t/${e.tournament_slug}`}>{e.tournament_name}</Link>{' '}
                vs <Link href={`/p/${e.opponent_handle}`}>{e.opponent_handle}</Link>
              </p>
              <p>
                <span className={isGain ? 'fn-green font-bold' : 'fn-red font-bold'}>
                  {isGain ? '+' : ''}{e.points}
                </span>
                {' '}
                <span className="mute">running: {e.running_total}</span>
                {' '}
                <Link href={`/match/${e.match_id}`} className="btn-link" style={{ float: 'right' }}>→</Link>
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}
