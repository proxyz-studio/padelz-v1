/**
 * Half-up rounding. Use this everywhere a score calculation produces a
 * fractional result — never bare `Math.round`, which is browser-dependent
 * at exactly .5 (spec §4.2).
 *
 * roundHalfUp(0.5)  === 1
 * roundHalfUp(1.5)  === 2
 * roundHalfUp(2.5)  === 3
 * roundHalfUp(47.5) === 48
 * roundHalfUp(-0.5) === 0
 */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}
