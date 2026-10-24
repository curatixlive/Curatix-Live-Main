import { describe, expect, it } from 'vitest';
import type { TicketTier } from '@/lib/api/types';
import { generateAccessCode, needsAccessGate, presaleState, tierBuyable } from './access';

const NOW = new Date('2026-06-10T12:00:00Z');
const base = {
  id: 't',
  available: 10,
  is_on_sale: false,
  sale_start: '2026-06-20T12:00:00Z',
  sale_end: null,
  presale_starts_at: '2026-06-05T12:00:00Z',
} as unknown as TicketTier;

describe('presaleState', () => {
  it('is open between the pre-sale start and the general sale', () => {
    expect(presaleState(base, NOW)).toBe('open');
  });
  it('is upcoming before the pre-sale start', () => {
    expect(presaleState({ ...base, presale_starts_at: '2026-06-15T00:00:00Z' }, NOW)).toBe(
      'upcoming',
    );
  });
  it('is none once general sale has begun, or with no pre-sale', () => {
    expect(presaleState({ ...base, sale_start: '2026-06-01T00:00:00Z' }, NOW)).toBe('none');
    expect(presaleState({ ...base, presale_starts_at: null }, NOW)).toBe('none');
  });
});

describe('tierBuyable', () => {
  it('needs access during the pre-sale', () => {
    expect(tierBuyable(base, false, NOW)).toBe(false);
    expect(tierBuyable(base, true, NOW)).toBe(true);
  });
  it('is never buyable when sold out, access or not', () => {
    expect(tierBuyable({ ...base, available: 0 }, true, NOW)).toBe(false);
  });
  it('ignores access for a tier already on general sale', () => {
    expect(tierBuyable({ ...base, is_on_sale: true }, false, NOW)).toBe(true);
  });
  it('stays closed before the pre-sale opens even with access', () => {
    const early = { ...base, presale_starts_at: '2026-06-15T00:00:00Z' } as TicketTier;
    expect(tierBuyable(early, true, NOW)).toBe(false);
  });
});

describe('needsAccessGate', () => {
  it('is for invite-only events and events with a pre-sale tier', () => {
    expect(needsAccessGate(true, [])).toBe(true);
    expect(needsAccessGate(false, [base])).toBe(true);
    expect(needsAccessGate(false, [{ ...base, presale_starts_at: null }])).toBe(false);
  });
});

describe('generateAccessCode', () => {
  it('is readable, the right length, and different each time', () => {
    const a = generateAccessCode();
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(generateAccessCode()).not.toBe(a);
  });
});
