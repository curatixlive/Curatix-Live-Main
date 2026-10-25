import { describe, expect, it } from 'vitest';
import {
  parseSeatGenders,
  pruneSeatGenders,
  seatGenderFor,
  seatGendersFromSelection,
  serialiseSeatGenders,
  withSeatGender,
} from './seat-gender';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('seat gender overrides', () => {
  it('round-trips', () => {
    const overrides = { [A]: 'female', [B]: 'standard' } as const;
    expect(parseSeatGenders(serialiseSeatGenders(overrides))).toEqual(overrides);
  });

  it('serialises in a stable order, so one choice is one URL', () => {
    expect(serialiseSeatGenders({ [B]: 'male', [A]: 'female' })).toBe(`${A}:f,${B}:m`);
  });

  it('ignores anything that is not a uuid:code pair', () => {
    expect(parseSeatGenders(`nope:f,${A}:x,${A},${B}:m`)).toEqual({ [B]: 'male' });
    expect(parseSeatGenders('')).toEqual({});
    expect(parseSeatGenders(null)).toEqual({});
  });

  it('lets a seat opt OUT of a default with an explicit standard', () => {
    expect(seatGenderFor(A, 'female', { [A]: 'standard' })).toBeUndefined();
    expect(seatGenderFor(A, 'female', {})).toBe('female');
    expect(seatGenderFor(A, 'female', { [A]: 'male' })).toBe('male');
    expect(seatGenderFor(A, undefined, {})).toBeUndefined();
  });

  it('builds the API map only from priced lines', () => {
    expect(
      seatGendersFromSelection([
        { tierId: 't1', quantity: 2, seatIds: [A, B], gender: 'female' },
        { tierId: 't2', quantity: 1, seatIds: ['c'] },
      ]),
    ).toEqual({ [A]: 'female', [B]: 'female' });
  });

  it('sets and prunes', () => {
    const set = withSeatGender({}, A, undefined);
    expect(set).toEqual({ [A]: 'standard' });
    expect(pruneSeatGenders({ [A]: 'male', [B]: 'female' }, [B])).toEqual({ [B]: 'female' });
  });
});
