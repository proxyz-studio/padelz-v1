import type { Tier } from '@/features/profiles/types';

export type LeaderboardPeriod = 'week' | 'month' | 'season';

export type LeaderboardRow = {
  rank: number;
  player_id: string;
  handle: string;
  display_name: string;
  tier: Tier;
  points_sum: number;
  match_count: number;
};
