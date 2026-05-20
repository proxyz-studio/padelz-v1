import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BracketView } from '@/features/tournaments/components/BracketView';
import type { BracketData } from '@/features/tournaments/bracket';

const pA = '00000000-0000-0000-0000-00000000000a';
const pB = '00000000-0000-0000-0000-00000000000b';
const pC = '00000000-0000-0000-0000-00000000000c';
const pD = '00000000-0000-0000-0000-00000000000d';

const players = new Map([
  [pA, { handle: 'alice', display_name: 'Alice' }],
  [pB, { handle: 'bob', display_name: 'Bob' }],
  [pC, { handle: 'carla', display_name: 'Carla' }],
  [pD, { handle: 'dan', display_name: 'Dan' }],
]);

describe('BracketView', () => {
  it('renders a flat round-robin bracket as a table', () => {
    const data: BracketData = {
      format: 'round_robin',
      matches: [
        { index: 0, team_a: [pA, pB], team_b: [pC, pD] },
      ],
    };
    const html = renderToStaticMarkup(
      <BracketView
        bracket={data}
        matches={new Map()}
        players={players}
        currentUserPlayerId={null}
      />,
    );
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
    expect(html).toContain('Carla');
    expect(html).toContain('Dan');
    expect(html).toContain('class="table');
  });

  it('renders a round-based americano bracket with round labels', () => {
    const data: BracketData = {
      format: 'americano',
      rounds: [
        { round: 1, matches: [{ index: 0, team_a: [pA, pB], team_b: [pC, pD] }] },
        { round: 2, matches: [{ index: 1, team_a: [pA, pC], team_b: [pB, pD] }] },
      ],
    };
    const html = renderToStaticMarkup(
      <BracketView
        bracket={data}
        matches={new Map()}
        players={players}
        currentUserPlayerId={null}
      />,
    );
    expect(html).toMatch(/Round\s+1/);
    expect(html).toMatch(/Round\s+2/);
  });

  it('renders a Submit score link only for matches the current user is in', () => {
    const matchId = '00000000-0000-0000-0000-000000000001';
    const data: BracketData = {
      format: 'round_robin',
      matches: [
        { index: 0, team_a: [pA, pB], team_b: [pC, pD] },
      ],
    };
    const matches = new Map([
      [matchId, {
        id: matchId,
        team_a: [pA, pB],
        team_b: [pC, pD],
        result_status: 'pending' as const,
      }],
    ]);
    const html = renderToStaticMarkup(
      <BracketView
        bracket={data}
        matches={matches}
        players={players}
        currentUserPlayerId={pA}
      />,
    );
    expect(html).toContain('Submit score');
  });
});
