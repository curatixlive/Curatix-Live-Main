import { describe, expect, it } from 'vitest';
import { yTicks } from './booking-trends-chart';

describe('yTicks', () => {
  it('never repeats a value, so one booking draws 0 and 1 once each', () => {
    expect(yTicks(1)).toEqual([0, 1]);
    expect(yTicks(0)).toEqual([0, 1]);
    expect(new Set(yTicks(3)).size).toBe(yTicks(3).length);
  });
  it('spreads a larger maximum in quarters', () => {
    expect(yTicks(26)).toEqual([0, 7, 13, 20, 26]);
  });
});
