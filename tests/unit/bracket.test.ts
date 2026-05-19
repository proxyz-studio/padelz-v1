import { describe, expect, it } from 'vitest';
import {
  generateBracketData,
  type BracketData,
  type BracketMatch,
  type BracketRound,
  type FlatBracketData,
  type RoundBracketData,
} from '@/features/tournaments/bracket';

// ── Helpers ───────────────────────────────────────────────────────────────────

function players(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

function asFlat(r: BracketData): FlatBracketData {
  if (r.format !== 'round_robin' && r.format !== 'bracket') {
    throw new Error(`Expected flat format, got ${r.format}`);
  }
  return r as FlatBracketData;
}

function asRound(r: BracketData): RoundBracketData {
  if (r.format !== 'americano' && r.format !== 'mexicano') {
    throw new Error(`Expected round format, got ${r.format}`);
  }
  return r as RoundBracketData;
}

// ── round_robin ───────────────────────────────────────────────────────────────

describe('generateBracketData — round_robin', () => {
  it('4 players produce 6 matches (C(4,2) every pair plays once)', () => {
    const r = asFlat(generateBracketData(['a', 'b', 'c', 'd'], 'round_robin'));
    expect(r.matches.length).toBe(6);
  });

  it('8 players produce 28 matches (C(8,2))', () => {
    const r = asFlat(generateBracketData(players(8), 'round_robin'));
    expect(r.matches.length).toBe(28);
  });

  it('every match has exactly 2 players on each side', () => {
    const r = asFlat(generateBracketData(players(4), 'round_robin'));
    for (const m of r.matches) {
      expect(m.team_a.length).toBe(2);
      expect(m.team_b.length).toBe(2);
    }
  });

  it('rejects player count not a multiple of 4', () => {
    expect(() => generateBracketData(players(6), 'round_robin')).toThrow();
    expect(() => generateBracketData(players(2), 'round_robin')).toThrow();
  });

  it('rejects fewer than 4 players', () => {
    expect(() => generateBracketData(players(3), 'round_robin')).toThrow();
  });
});

// ── americano ─────────────────────────────────────────────────────────────────

describe('generateBracketData — americano', () => {
  it('4 players produce a 3-round rotation', () => {
    const r = asRound(generateBracketData(['a', 'b', 'c', 'd'], 'americano'));
    expect(r.rounds.length).toBe(3);
  });

  it('each round has exactly 1 match with 4 players (1 court)', () => {
    const r = asRound(generateBracketData(['a', 'b', 'c', 'd'], 'americano'));
    expect(r.rounds.every((rd: BracketRound) => rd.matches.length === 1)).toBe(true);
  });

  it('each player partners with each other player exactly once across rounds', () => {
    const ps = ['a', 'b', 'c', 'd'];
    const r = asRound(generateBracketData(ps, 'americano'));
    // Collect all (player, partner) pairs
    const partnerCounts = new Map<string, Map<string, number>>();
    for (const p of ps) partnerCounts.set(p, new Map());
    for (const rd of r.rounds) {
      for (const m of rd.matches) {
        const teams = [m.team_a, m.team_b];
        for (const team of teams) {
          const [x, y] = team;
          const xMap = partnerCounts.get(x)!;
          const yMap = partnerCounts.get(y)!;
          xMap.set(y, (xMap.get(y) ?? 0) + 1);
          yMap.set(x, (yMap.get(x) ?? 0) + 1);
        }
      }
    }
    // Every player should have partnered exactly once with each other player
    for (const [p, partners] of partnerCounts) {
      const others = ps.filter((x) => x !== p);
      for (const other of others) {
        expect(partners.get(other)).toBe(1);
      }
    }
  });

  it('rejects odd player count', () => {
    expect(() => generateBracketData(['a', 'b', 'c'], 'americano')).toThrow();
  });

  it('rejects player count not a multiple of 4', () => {
    expect(() => generateBracketData(players(6), 'americano')).toThrow();
    expect(() => generateBracketData(players(2), 'americano')).toThrow();
  });

  it('8 players produce 7 rounds (each player partners 7 others once)', () => {
    const r = asRound(generateBracketData(players(8), 'americano'));
    expect(r.rounds.length).toBe(7);
  });
});

// ── mexicano ──────────────────────────────────────────────────────────────────

describe('generateBracketData — mexicano', () => {
  it('4 players produce exactly 1 initial round', () => {
    const r = asRound(generateBracketData(['a', 'b', 'c', 'd'], 'mexicano'));
    expect(r.rounds.length).toBe(1);
  });

  it('initial round has 1 match for 4 players', () => {
    const r = asRound(generateBracketData(['a', 'b', 'c', 'd'], 'mexicano'));
    expect(r.rounds[0].matches.length).toBe(1);
  });

  it('initial round match contains all 4 players across both teams', () => {
    const ps = ['a', 'b', 'c', 'd'];
    const r = asRound(generateBracketData(ps, 'mexicano'));
    const m: BracketMatch = r.rounds[0].matches[0];
    const all = [...m.team_a, ...m.team_b];
    expect(all.sort()).toEqual(ps.sort());
  });

  it('rejects player count not a multiple of 4', () => {
    expect(() => generateBracketData(players(6), 'mexicano')).toThrow();
    expect(() => generateBracketData(players(2), 'mexicano')).toThrow();
  });

  it('8 players produce 1 initial round with 2 matches', () => {
    const r = asRound(generateBracketData(players(8), 'mexicano'));
    expect(r.rounds.length).toBe(1);
    expect(r.rounds[0].matches.length).toBe(2);
  });
});

// ── bracket (single-elim) ─────────────────────────────────────────────────────

describe('generateBracketData — bracket (single-elim)', () => {
  it('8 players produce 7 matches across 3 rounds', () => {
    const r = asFlat(generateBracketData(players(8), 'bracket'));
    expect(r.matches.length).toBe(7);
  });

  it('4 players produce 3 matches (3 rounds: 2 → 1)', () => {
    const r = asFlat(generateBracketData(players(4), 'bracket'));
    expect(r.matches.length).toBe(3);
  });

  it('16 players produce 15 matches', () => {
    const r = asFlat(generateBracketData(players(16), 'bracket'));
    expect(r.matches.length).toBe(15);
  });

  it('matches link via next_match_id forming a tree', () => {
    const r = asFlat(generateBracketData(players(8), 'bracket'));
    // The final match has no next_match_id; all others do
    const finals = r.matches.filter((m: BracketMatch) => m.next_match_id == null);
    const nonFinals = r.matches.filter((m: BracketMatch) => m.next_match_id != null);
    expect(finals.length).toBe(1);
    expect(nonFinals.length).toBe(6);
  });

  it('rejects non-power-of-2 player counts', () => {
    expect(() => generateBracketData(players(6), 'bracket')).toThrow();
    expect(() => generateBracketData(players(12), 'bracket')).toThrow();
    expect(() => generateBracketData(players(3), 'bracket')).toThrow();
  });

  it('rejects player count not a multiple of 4', () => {
    // 4 is the minimum for doubles
    expect(() => generateBracketData(players(2), 'bracket')).toThrow();
  });
});
