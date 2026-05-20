// src/features/tournaments/components/BracketView.tsx
import Link from 'next/link';
import type { BracketData, BracketMatch, RoundBracketData } from '@/features/tournaments/bracket';

type PlayerInfo = { handle: string; display_name: string };

type MatchInfo = {
  id: string;
  team_a: string[];
  team_b: string[];
  result_status: 'pending' | 'confirmed' | 'disputed' | 'admin_set' | 'void';
  score_a?: number | null;
  score_b?: number | null;
};

type Props = {
  bracket: BracketData;
  matches: Map<string, MatchInfo>;
  players: Map<string, PlayerInfo>;
  currentUserPlayerId: string | null;
};

function nameOf(players: Map<string, PlayerInfo>, id: string): string {
  return players.get(id)?.display_name ?? '?';
}

function teamLabel(players: Map<string, PlayerInfo>, ids: string[]): string {
  return ids.map((id) => nameOf(players, id)).join(' + ');
}

function findMatch(matches: Map<string, MatchInfo>, m: BracketMatch): MatchInfo | undefined {
  for (const mi of matches.values()) {
    if (
      mi.team_a.length === m.team_a.length &&
      mi.team_b.length === m.team_b.length &&
      mi.team_a.every((id, i) => id === m.team_a[i]) &&
      mi.team_b.every((id, i) => id === m.team_b[i])
    ) {
      return mi;
    }
  }
  return undefined;
}

function MatchRow({
  m,
  matches,
  players,
  currentUserPlayerId,
}: {
  m: BracketMatch;
  matches: Map<string, MatchInfo>;
  players: Map<string, PlayerInfo>;
  currentUserPlayerId: string | null;
}) {
  const info = findMatch(matches, m);
  const userInMatch =
    currentUserPlayerId != null &&
    (m.team_a.includes(currentUserPlayerId) || m.team_b.includes(currentUserPlayerId));
  const isPending = info?.result_status === 'pending' || info?.result_status === undefined;
  const isDisputed = info?.result_status === 'disputed';
  const aWins = info?.score_a != null && info?.score_b != null && info.score_a > info.score_b;
  const bWins = info?.score_a != null && info?.score_b != null && info.score_b > info.score_a;
  const scoreCell = isDisputed ? (
    <span className="fn-red font-bold">Disputed</span>
  ) : info?.score_a != null && info?.score_b != null ? (
    <>
      <span className={aWins ? 'fn-green font-bold' : ''}>{info.score_a}</span>
      {' – '}
      <span className={bWins ? 'fn-green font-bold' : ''}>{info.score_b}</span>
    </>
  ) : (
    <span className="mute">pending</span>
  );

  return (
    <tr>
      <td>{teamLabel(players, m.team_a)}</td>
      <td>{teamLabel(players, m.team_b)}</td>
      <td>{scoreCell}</td>
      <td style={{ textAlign: 'right', width: '56px' }}>
        {info ? (
          userInMatch && isPending ? (
            <Link href={`/match/${info.id}/submit`} className="btn-link fn-blue font-bold">
              Submit score →
            </Link>
          ) : (
            <Link href={`/match/${info.id}`} className="btn-link">→</Link>
          )
        ) : null}
      </td>
    </tr>
  );
}

function MatchCard({
  m,
  matches,
  players,
  currentUserPlayerId,
}: {
  m: BracketMatch;
  matches: Map<string, MatchInfo>;
  players: Map<string, PlayerInfo>;
  currentUserPlayerId: string | null;
}) {
  const info = findMatch(matches, m);
  const userInMatch =
    currentUserPlayerId != null &&
    (m.team_a.includes(currentUserPlayerId) || m.team_b.includes(currentUserPlayerId));
  const isPending = info?.result_status === 'pending' || info?.result_status === undefined;
  return (
    <div className="rule-bottom" style={{ padding: '0.75em 0' }}>
      <p>{teamLabel(players, m.team_a)}</p>
      <p className="mute">vs</p>
      <p>{teamLabel(players, m.team_b)}</p>
      <div style={{ marginTop: '0.5em' }}>
        {info?.result_status === 'disputed' ? (
          <span className="fn-red font-bold">Disputed</span>
        ) : info?.score_a != null && info?.score_b != null ? (
          <span>
            <span className={info.score_a > info.score_b ? 'fn-green font-bold' : ''}>{info.score_a}</span>
            {' – '}
            <span className={info.score_b > info.score_a ? 'fn-green font-bold' : ''}>{info.score_b}</span>
          </span>
        ) : (
          <span className="mute">pending</span>
        )}
        {info ? (
          <span style={{ float: 'right' }}>
            {userInMatch && isPending ? (
              <Link href={`/match/${info.id}/submit`} className="btn-link fn-blue font-bold">
                Submit →
              </Link>
            ) : (
              <Link href={`/match/${info.id}`} className="btn-link">View →</Link>
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function BracketView({ bracket, matches, players, currentUserPlayerId }: Props) {
  if (bracket.format === 'round_robin' || bracket.format === 'bracket') {
    return (
      <>
        <table className="table desktop-only">
          <thead>
            <tr>
              <th>Team A</th>
              <th>Team B</th>
              <th>Score</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bracket.matches.map((m) => (
              <MatchRow key={m.index} m={m} matches={matches} players={players} currentUserPlayerId={currentUserPlayerId} />
            ))}
          </tbody>
        </table>
        <div className="mobile-only">
          {bracket.matches.map((m) => (
            <MatchCard key={m.index} m={m} matches={matches} players={players} currentUserPlayerId={currentUserPlayerId} />
          ))}
        </div>
      </>
    );
  }

  // RoundBracketData: americano | mexicano
  // TS does not narrow BracketData through the compound `||` early-return guard above,
  // so the cast is required here even though logically only RoundBracketData can reach this point.
  const roundBracket = bracket as RoundBracketData;
  return (
    <>
      {roundBracket.rounds.map((round) => (
        <section key={round.round} style={{ marginTop: '2em' }}>
          <p className="mute">Round {round.round}</p>
          <table className="table desktop-only">
            <thead>
              <tr>
                <th>Team A</th>
                <th>Team B</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {round.matches.map((m: BracketMatch) => (
                <MatchRow key={m.index} m={m} matches={matches} players={players} currentUserPlayerId={currentUserPlayerId} />
              ))}
            </tbody>
          </table>
          <div className="mobile-only">
            {round.matches.map((m: BracketMatch) => (
              <MatchCard key={m.index} m={m} matches={matches} players={players} currentUserPlayerId={currentUserPlayerId} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
