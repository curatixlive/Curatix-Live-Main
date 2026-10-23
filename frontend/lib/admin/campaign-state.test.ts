import { describe, expect, it } from 'vitest';
import { campaignPhase, fromLocalInput, toLocalInput } from './campaign-state';

const NOW = new Date('2026-10-12T10:00:00Z');
const base = { status: 'published' as const, starts_at: null, ends_at: null };

describe('campaignPhase', () => {
  it('treats anything not published as a draft, whatever its dates', () => {
    expect(campaignPhase({ ...base, status: 'draft' }, NOW)).toBe('draft');
    expect(campaignPhase({ ...base, status: 'archived' }, NOW)).toBe('draft');
  });
  it('is live inside the window or with no window', () => {
    expect(campaignPhase(base, NOW)).toBe('live');
    expect(
      campaignPhase(
        { ...base, starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-30T00:00:00Z' },
        NOW,
      ),
    ).toBe('live');
  });
  it('is scheduled before the start and ended from the end instant', () => {
    expect(campaignPhase({ ...base, starts_at: '2026-10-13T00:00:00Z' }, NOW)).toBe('scheduled');
    expect(campaignPhase({ ...base, ends_at: '2026-10-12T10:00:00Z' }, NOW)).toBe('ended');
  });
});

describe('datetime-local conversion', () => {
  it('round-trips an instant', () => {
    const iso = '2026-10-12T10:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
  it('treats blank and nonsense as no date', () => {
    expect(toLocalInput(null)).toBe('');
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('not a date')).toBeNull();
  });
});
