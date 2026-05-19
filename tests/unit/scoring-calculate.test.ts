import { describe, expect, it } from 'vitest';
import { TIERS } from '@/features/profiles/types';
import { calculate } from '@/features/scoring/calculate';
import type { MatchInput } from '@/features/scoring/types';

// ── helper builders ─────────────────────────────────────────────────────────

type Override = Partial<MatchInput>;

function match(o: Override = {}): MatchInput {
  return {
    id: 'm',
    tournament_id: 't',
    team_a: ['a1', 'a2'],
    team_b: ['b1', 'b2'],
    team_a_tiers: ['gold', 'gold'],
    team_b_tiers: ['gold', 'gold'],
    team_a_score: 21,
    team_b_score: 18,
    format: 'americano',
    tournament_type: 'club_internal',
    ...o,
  };
}

// ── spec §4.6 worked example ────────────────────────────────────────────────

describe('calculate — spec §4.6 worked example', () => {
  it('Gold wins 24-21 americano club_internal vs Silver+Platinum (avg = Gold) → 60.95', () => {
    const result = calculate(
      match({
        team_a_tiers: ['gold', 'gold'],
        team_b_tiers: ['silver', 'platinum'],
        team_a_score: 24,
        team_b_score: 21,
      }),
    );
    const a1 = result.find((r) => r.player_id === 'a1');
    expect(a1).toBeDefined();
    if (!a1) return;

    // base = roundHalfUp(100 × 24 / 45) = roundHalfUp(53.33) = 53
    expect(a1.breakdown.base).toBe(53);
    expect(a1.breakdown.tier_mult).toBe(1.0); // same tier (gold vs avg-gold)
    expect(a1.breakdown.tournament_modifier).toBe(1.0); // club_internal
    expect(a1.breakdown.format_modifier).toBe(1.15); // americano
    expect(a1.breakdown.avg_opponent_tier).toBe('gold');
    expect(a1.breakdown.result).toBe('win');
    // 53 × 1.0 × 1.0 × 1.15 = 60.95
    expect(a1.points).toBeCloseTo(60.95, 2);
  });
});

// ── format × tier matrix ────────────────────────────────────────────────────

describe('calculate — full matrix', () => {
  describe.each(['americano', 'mexicano', 'round_robin', 'bracket'] as const)(
    'format=%s',
    (format) => {
      describe.each([
        'open',
        'club_internal',
        'group',
        'casual',
      ] as const)('tournament_type=%s', (tournament_type) => {
        it.each(TIERS)(
          'same-tier match: winner has tier_mult=1.0, result=win',
          (tier) => {
            const r = calculate(
              match({
                team_a_tiers: [tier, tier],
                team_b_tiers: [tier, tier],
                team_a_score: 21,
                team_b_score: 18,
                format,
                tournament_type,
              }),
            );
            const a1 = r.find((x) => x.player_id === 'a1');
            expect(a1?.breakdown.tier_mult).toBe(1.0);
            expect(a1?.breakdown.result).toBe('win');
            const b1 = r.find((x) => x.player_id === 'b1');
            expect(b1?.breakdown.result).toBe('loss');
            expect(b1?.breakdown.tier_mult).toBe(1.0);
          },
        );
      });
    },
  );

  describe('cross-tier tier_mult on win', () => {
    // (yourTier, opponentTier) → expected multiplier when you win
    it.each([
      ['bronze', 'silver', 1.5], //  +1 diff
      ['bronze', 'gold', 2.0], //   +2 diff (capped)
      ['bronze', 'platinum', 2.0], // +3 capped
      ['bronze', 'diamond', 2.0], //  +4 capped
      ['gold', 'silver', 0.5], //   -1 diff
      ['gold', 'bronze', 0.25], //  -2 diff (floor)
      ['diamond', 'bronze', 0.25], // -4 (floor)
      ['silver', 'silver', 1.0], //  0
    ] as const)(
      'cross-tier win: your=%s, opp_avg=%s → mult=%f',
      (yourTier, oppTier, expected) => {
        const r = calculate(
          match({
            team_a_tiers: [yourTier, yourTier],
            team_b_tiers: [oppTier, oppTier],
            team_a_score: 21,
            team_b_score: 18,
          }),
        );
        const a1 = r.find((x) => x.player_id === 'a1');
        expect(a1?.breakdown.tier_mult).toBe(expected);
      },
    );
  });

  describe('opponent average tier (roundHalfUp)', () => {
    it.each([
      [['bronze', 'silver'] as const, 'silver'], //  1.5 → 2
      [['silver', 'gold'] as const, 'gold'], //      2.5 → 3
      [['gold', 'platinum'] as const, 'platinum'], // 3.5 → 4
      [['platinum', 'diamond'] as const, 'diamond'], // 4.5 → 5
      [['silver', 'diamond'] as const, 'platinum'], //  3.5 → 4
      [['bronze', 'diamond'] as const, 'gold'], //      3   → 3
    ])('opponents %o average to %s', (opp, expected) => {
      const r = calculate(
        match({ team_a_tiers: ['gold', 'gold'], team_b_tiers: opp }),
      );
      expect(r[0].breakdown.avg_opponent_tier).toBe(expected);
    });
  });

  describe('americano / mexicano base = score ratio with participation floor', () => {
    it('21-19 win americano: base ≈ roundHalfUp(100×21/40) = 53', () => {
      const r = calculate(
        match({
          team_a_score: 21,
          team_b_score: 19,
          format: 'americano',
        }),
      );
      expect(r.find((x) => x.player_id === 'a1')?.breakdown.base).toBe(53);
    });

    it('21-19 loss americano: base = 48 (47.5 → roundHalfUp = 48)', () => {
      const r = calculate(
        match({
          team_a_score: 21,
          team_b_score: 19,
          format: 'americano',
        }),
      );
      expect(r.find((x) => x.player_id === 'b1')?.breakdown.base).toBe(48);
    });

    it('21-3 loss americano floors loser base at 25 (participation)', () => {
      const r = calculate(
        match({
          team_a_score: 21,
          team_b_score: 3,
          format: 'americano',
        }),
      );
      expect(r.find((x) => x.player_id === 'b1')?.breakdown.base).toBe(25);
    });

    it('0-0 in americano returns empty (tie)', () => {
      const r = calculate(
        match({ team_a_score: 0, team_b_score: 0, format: 'americano' }),
      );
      expect(r).toEqual([]);
    });
  });

  describe('bracket / round_robin: flat win=100, loss=25', () => {
    it.each(['bracket', 'round_robin'] as const)(
      '%s win = 100, loss = 25',
      (format) => {
        const r = calculate(
          match({
            team_a_score: 6,
            team_b_score: 4,
            format,
          }),
        );
        expect(r.find((x) => x.player_id === 'a1')?.breakdown.base).toBe(100);
        expect(r.find((x) => x.player_id === 'b1')?.breakdown.base).toBe(25);
      },
    );
  });

  describe('ties produce no awards', () => {
    it('returns empty array on team_a_score === team_b_score', () => {
      const r = calculate(
        match({
          team_a_score: 10,
          team_b_score: 10,
        }),
      );
      expect(r).toEqual([]);
    });
  });

  describe('all four players receive an award', () => {
    it('returns 4 awards in a 2v2 match', () => {
      const r = calculate(match({}));
      expect(r).toHaveLength(4);
      expect(r.map((a) => a.player_id).sort()).toEqual([
        'a1',
        'a2',
        'b1',
        'b2',
      ]);
    });
  });

  describe('modifier composition', () => {
    it('open + americano gold same-tier win 24-21: 53 × 1.0 × 1.2 × 1.15 ≈ 73.14', () => {
      const r = calculate(
        match({
          format: 'americano',
          tournament_type: 'open',
          team_a_score: 24,
          team_b_score: 21,
        }),
      );
      const a1 = r.find((x) => x.player_id === 'a1');
      expect(a1?.points).toBeCloseTo(73.14, 2);
    });

    it('casual + bracket gold same-tier win: 100 × 1.0 × 0.85 × 1.0 = 85.00', () => {
      const r = calculate(
        match({
          format: 'bracket',
          tournament_type: 'casual',
          team_a_score: 6,
          team_b_score: 3,
        }),
      );
      const a1 = r.find((x) => x.player_id === 'a1');
      expect(a1?.points).toBe(85);
    });
  });

  describe('loss tier_mult is always 1.0', () => {
    it.each([
      ['bronze', 'diamond'], //  +4 win mult would be 2.0; loss = 1.0
      ['diamond', 'bronze'], //  -4 win mult would be 0.25; loss = 1.0
      ['silver', 'gold'], //     +1 win = 1.5; loss = 1.0
    ] as const)(
      'loss with diff your=%s opp=%s: tier_mult=1.0',
      (yourTier, oppTier) => {
        const r = calculate(
          match({
            team_a_tiers: [yourTier, yourTier],
            team_b_tiers: [oppTier, oppTier],
            team_a_score: 15,
            team_b_score: 21, // team A loses
          }),
        );
        const a1 = r.find((x) => x.player_id === 'a1');
        expect(a1?.breakdown.tier_mult).toBe(1.0);
        expect(a1?.breakdown.result).toBe('loss');
      },
    );
  });
});
