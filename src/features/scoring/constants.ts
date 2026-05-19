/**
 * Scoring constants. Locked values per spec §4 — do not tweak without
 * design review. Each constant flows into calculate().
 */

// Base flat points for bracket-style matches (single sudden-death).
// Americano / Mexicano formats derive base from score ratio instead.
export const BASE_WIN_FLAT = 100;
export const BASE_LOSS_FLAT = 25;

/**
 * Tier-difference multiplier on win, indexed by (avg_opponent_tier - your_tier).
 *
 * Positive diff = opponents were higher-rated → underdog win → bonus.
 * Negative diff = opponents were lower-rated → expected win → reduced.
 * Loss always uses 1.0 (tier_mult does not punish you for losing to lower tiers
 * beyond the base loss flat).
 */
export const TIER_MULT_ON_WIN: Record<number, number> = {
  [-4]: 0.25,
  [-3]: 0.25,
  [-2]: 0.25,
  [-1]: 0.5,
  [0]: 1.0,
  [1]: 1.5,
  [2]: 2.0,
  [3]: 2.0,
  [4]: 2.0,
};

/**
 * Tournament-type modifier. Open tournaments are weighted heavier because they
 * attract a wider tier band; casual matches are lighter.
 */
export const TOURNAMENT_MODIFIER = {
  open: 1.2,
  club_internal: 1.0,
  group: 1.0,
  casual: 0.85,
} as const;

/**
 * Format modifier. Americano / Mexicano are competitive randomized rotations
 * and weight heavier than round-robin / bracket where every match is a
 * single-pair event.
 */
export const FORMAT_MODIFIER = {
  americano: 1.15,
  mexicano: 1.15,
  round_robin: 1.0,
  bracket: 1.0,
} as const;
