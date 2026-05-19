import { describe, expect, it } from 'vitest';
import { roundHalfUp } from '@/features/scoring/rounding';

describe('roundHalfUp', () => {
  it.each([
    [0.5, 1],
    [1.5, 2],
    [2.5, 3],
    [3.5, 4],
    [4.5, 5],
    [47.5, 48],
    [53.33, 53],
    [53.5, 54],
    [12.5, 13],
    [-0.5, 0],
    [0, 0],
    [100, 100],
    [0.49, 0],
    [0.51, 1],
  ])('roundHalfUp(%f) === %i', (input, expected) => {
    expect(roundHalfUp(input)).toBe(expected);
  });

  it('beats Math.round at exactly 0.5 (deterministic across runtimes)', () => {
    // Math.round(0.5) returns 0 in some browser engines (banker's rounding);
    // roundHalfUp guarantees 1.
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(2.5)).toBe(3);
  });
});
