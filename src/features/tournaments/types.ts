export type TournamentFormat = 'americano' | 'mexicano' | 'round_robin' | 'bracket';
export type TournamentType = 'open' | 'club_internal' | 'group' | 'casual';
export type TournamentStatus = 'draft' | 'open' | 'in_progress' | 'complete';

// Read-only contract: M3 + M4 import this. M2 owns the underlying table shape.
export type MatchForScoring = {
  id: string;
  tournament_id: string;
  team_a: readonly [string, string];   // exactly 2 player IDs
  team_b: readonly [string, string];
  format: TournamentFormat;
  tournament_type: TournamentType;
};
