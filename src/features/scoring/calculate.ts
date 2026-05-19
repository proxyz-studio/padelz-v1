/**
 * Pure points calculator. Stateless, deterministic, no DB access.
 * Inputs: MatchInput; output: PointsAward[] (one per player on each team).
 *
 * Tied matches produce zero awards. Tied input would be invalid for ranked
 * play; admin should void via adminVoidMatch instead.
 *
 * Spec §4.6 worked example covered by the unit test suite. ~30 tests in
 * scoring-calculate.test.ts cover all 4 formats × tier matrix; expand to
 * ~250 cases as needed.
 */

import { TIERS, TIER_TO_INT, type Tier } from '@/features/profiles/types';
import {
  BASE_LOSS_FLAT,
  BASE_WIN_FLAT,
  FORMAT_MODIFIER,
  TIER_MULT_ON_WIN,
  TOURNAMENT_MODIFIER,
} from './constants';
import { roundHalfUp } from './rounding';
import type { MatchInput, PointsAward } from './types';

function averageTier(tiers: readonly [Tier, Tier]): Tier {
  const avg = (TIER_TO_INT[tiers[0]] + TIER_TO_INT[tiers[1]]) / 2;
  const rounded = roundHalfUp(avg);
  // TIERS is the canonical 1-indexed order: bronze=1 silver=2 gold=3 platinum=4 diamond=5
  return TIERS[rounded - 1] ?? TIERS[TIERS.length - 1];
}

function basePoints(
  input: MatchInput,
  yourScore: number,
  oppScore: number,
  isWinner: boolean,
): number {
  if (input.format === 'americano' || input.format === 'mexicano') {
    const total = yourScore + oppScore;
    if (total === 0) return BASE_LOSS_FLAT;
    // 100 × (yourScore / total), floored at BASE_LOSS_FLAT for participation.
    return Math.max(BASE_LOSS_FLAT, roundHalfUp((100 * yourScore) / total));
  }
  return isWinner ? BASE_WIN_FLAT : BASE_LOSS_FLAT;
}

export function calculate(input: MatchInput): PointsAward[] {
  if (input.team_a_score === input.team_b_score) return [];

  const aWon = input.team_a_score > input.team_b_score;
  const tournamentMod = TOURNAMENT_MODIFIER[input.tournament_type];
  const formatMod = FORMAT_MODIFIER[input.format];
  const awards: PointsAward[] = [];

  for (const side of ['a', 'b'] as const) {
    const isWinner = side === 'a' ? aWon : !aWon;
    const yourScore = side === 'a' ? input.team_a_score : input.team_b_score;
    const oppScore = side === 'a' ? input.team_b_score : input.team_a_score;
    const yourPlayers = side === 'a' ? input.team_a : input.team_b;
    const yourTiers = side === 'a' ? input.team_a_tiers : input.team_b_tiers;
    const oppTiers = side === 'a' ? input.team_b_tiers : input.team_a_tiers;
    const avgOpp = averageTier(oppTiers);

    for (let i = 0; i < yourPlayers.length; i++) {
      const yourTier = yourTiers[i];
      const tierDiff = TIER_TO_INT[avgOpp] - TIER_TO_INT[yourTier];
      const tierMult = isWinner ? (TIER_MULT_ON_WIN[tierDiff] ?? 1.0) : 1.0;
      const base = basePoints(input, yourScore, oppScore, isWinner);
      // Compose multipliers then half-up round to 2 decimals.
      const raw = base * tierMult * tournamentMod * formatMod;
      const points = roundHalfUp(raw * 100) / 100;

      awards.push({
        player_id: yourPlayers[i],
        points,
        breakdown: {
          base,
          tier_mult: tierMult,
          avg_opponent_tier: avgOpp,
          your_tier: yourTier,
          tournament_modifier: tournamentMod,
          format_modifier: formatMod,
          result: isWinner ? 'win' : 'loss',
          points_won: yourScore,
          points_lost: oppScore,
        },
      });
    }
  }

  return awards;
}
