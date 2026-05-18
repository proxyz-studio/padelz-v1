import type { Tier } from '@/features/profiles/types';
import type { MatchForScoring } from '@/features/tournaments/types';

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export type MatchInput = MatchForScoring & {
  team_a_score: number;
  team_b_score: number;
  team_a_tiers: readonly [Tier, Tier];
  team_b_tiers: readonly [Tier, Tier];
};

export type PointsAward = {
  player_id: string;
  points: number;
  breakdown: {
    base: number;
    tier_mult: number;
    avg_opponent_tier: Tier;
    your_tier: Tier;
    tournament_modifier: number;
    format_modifier: number;
    result: 'win' | 'loss';
    points_won: number;
    points_lost: number;
  };
};
