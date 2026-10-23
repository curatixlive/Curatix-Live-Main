import { describe, expect, it } from 'vitest';
import { needsBackwardRotation, needsForwardRotation, rotateOrder, sameIds } from './rail-order';

describe('rotateOrder', () => {
  it('moves the first card to the back going forward, and the last to the front going back', () => {
    expect(rotateOrder(['a', 'b', 'c', 'd'], 1)).toEqual(['b', 'c', 'd', 'a']);
    expect(rotateOrder(['a', 'b', 'c', 'd'], -1)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('keeps every card exactly once — no clones', () => {
    let order = ['a', 'b', 'c', 'd', 'e'];
    for (let i = 0; i < 23; i += 1) order = rotateOrder(order, i % 3 === 0 ? -1 : 1);
    expect([...order].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('is its own inverse', () => {
    const order = ['a', 'b', 'c'];
    expect(rotateOrder(rotateOrder(order, 1), -1)).toEqual(order);
  });

  it('returns to the start after a full lap, so the loop is genuinely seamless', () => {
    const order = ['a', 'b', 'c', 'd'];
    let laps = order;
    for (let i = 0; i < order.length; i += 1) laps = rotateOrder(laps, 1);
    expect(laps).toEqual(order);
  });

  it('handles zero and one card without inventing a neighbour', () => {
    expect(rotateOrder([], 1)).toEqual([]);
    expect(rotateOrder(['only'], 1)).toEqual(['only']);
    expect(rotateOrder(['only'], -1)).toEqual(['only']);
  });

  it('does not mutate its input', () => {
    const order = Object.freeze(['a', 'b', 'c']);
    expect(() => rotateOrder(order, 1)).not.toThrow();
  });
});

describe('sameIds', () => {
  it('compares membership, not order', () => {
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameIds(['a', 'b'], ['a', 'c'])).toBe(false);
    expect(sameIds(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('when a rotation is needed', () => {
  it('forward only at the end of the rail', () => {
    expect(needsForwardRotation(0, 1000, 400)).toBe(false);
    expect(needsForwardRotation(598, 1000, 400)).toBe(true); // within the 4px tolerance
    expect(needsForwardRotation(600, 1000, 400)).toBe(true);
  });
  it('backward only at the start', () => {
    expect(needsBackwardRotation(0)).toBe(true);
    expect(needsBackwardRotation(3)).toBe(true);
    expect(needsBackwardRotation(250)).toBe(false);
  });
});
