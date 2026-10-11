import { describe, expect, it } from 'vitest';
import type { PromoCampaign } from '@/lib/api/cms';
import { activeCampaigns, safeCampaignHref } from './promo';

const base: PromoCampaign = {
  id: 'a',
  kind: 'image',
  media_url: 'https://cdn.example.com/a.jpg',
  alt_text: 'Crowd at a festival',
  title: 'Navratri Nights',
};
const NOW = new Date('2026-10-12T10:00:00Z');

describe('safeCampaignHref', () => {
  it('allows site paths and https URLs', () => {
    expect(safeCampaignHref('/events?category=music')).toBe('/events?category=music');
    expect(safeCampaignHref('https://partner.example.com/x')).toBe('https://partner.example.com/x');
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    '//evil.example.com',
    'http://x.example.com',
    '',
    '  ',
    'not a url',
  ])('rejects %j', (href) => expect(safeCampaignHref(href)).toBeNull());
  it('treats null and undefined as no link', () => {
    expect(safeCampaignHref(undefined)).toBeNull();
    expect(safeCampaignHref(null)).toBeNull();
  });
});

describe('activeCampaigns', () => {
  it('returns nothing when the backend sends nothing', () => {
    expect(activeCampaigns(undefined, NOW)).toEqual([]);
    expect(activeCampaigns([], NOW)).toEqual([]);
  });
  it('honours the schedule window', () => {
    const future = { ...base, id: 'f', starts_at: '2026-10-13T00:00:00Z' };
    const ended = { ...base, id: 'e', ends_at: '2026-10-12T10:00:00Z' };
    const live = {
      ...base,
      id: 'l',
      starts_at: '2026-10-01T00:00:00Z',
      ends_at: '2026-10-30T00:00:00Z',
    };
    expect(activeCampaigns([future, ended, live], NOW).map((c) => c.id)).toEqual(['l']);
  });
  it('drops campaigns with unusable media, no title or no alt text', () => {
    expect(
      activeCampaigns(
        [
          { ...base, id: '1', media_url: 'javascript:alert(1)' },
          { ...base, id: '2', media_url: 'http://insecure.example.com/a.jpg' },
          { ...base, id: '3', title: '  ' },
          { ...base, id: '4', alt_text: '' },
          { ...base, id: '5' },
        ],
        NOW,
      ).map((c) => c.id),
    ).toEqual(['5']);
  });
  it('orders by position then id and caps the count', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...base, id: `c${i}`, position: 9 - i }));
    const result = activeCampaigns(many, NOW);
    expect(result).toHaveLength(6);
    expect(result[0]?.id).toBe('c8');
  });
});
