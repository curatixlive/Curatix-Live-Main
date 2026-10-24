import { describe, expect, it } from 'vitest';
import { formatDistance, haversineKm, parseCoordinate, venuePoint } from './distance';

const mumbai = { latitude: 19.076, longitude: 72.8777 };
const pune = { latitude: 18.5204, longitude: 73.8567 };

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(mumbai, mumbai)).toBeCloseTo(0, 5);
  });
  it('matches the known Mumbai to Pune distance (~120 km)', () => {
    const km = haversineKm(mumbai, pune);
    expect(km).toBeGreaterThan(115);
    expect(km).toBeLessThan(125);
  });
  it('is symmetric', () => {
    expect(haversineKm(mumbai, pune)).toBeCloseTo(haversineKm(pune, mumbai), 6);
  });
});

describe('venuePoint', () => {
  it('needs BOTH coordinates', () => {
    expect(venuePoint({ latitude: 19, longitude: null })).toBeNull();
    expect(venuePoint({ latitude: undefined, longitude: 72 })).toBeNull();
    expect(venuePoint({})).toBeNull();
  });
  it('reads decimal strings from the API', () => {
    expect(venuePoint({ latitude: '19.0760000', longitude: '72.8777000' })).toEqual(mumbai);
  });
  it('rejects out-of-range and non-numeric values rather than guessing', () => {
    expect(venuePoint({ latitude: 120, longitude: 72 })).toBeNull();
    expect(venuePoint({ latitude: 'abc', longitude: 72 })).toBeNull();
  });
  it('parseCoordinate treats blanks as absent, not zero', () => {
    expect(parseCoordinate('')).toBeNull();
    expect(parseCoordinate(null)).toBeNull();
    expect(parseCoordinate(0)).toBe(0);
  });
});

describe('formatDistance', () => {
  it('uses metres under a kilometre, in steps of fifty', () => {
    expect(formatDistance(0.83)).toBe('850 m away');
    expect(formatDistance(0.01)).toBe('50 m away');
  });
  it('shows one decimal under ten km and whole km above', () => {
    expect(formatDistance(3.24)).toBe('3.2 km away');
    expect(formatDistance(42.4)).toBe('42 km away');
  });
  it('says nothing for an invalid distance', () => {
    expect(formatDistance(Number.NaN)).toBe('');
    expect(formatDistance(-1)).toBe('');
  });
});
