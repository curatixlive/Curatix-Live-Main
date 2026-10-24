import { describe, expect, it } from 'vitest';
import { inferCategory } from './categories';

describe('inferCategory', () => {
  it('prefers the organiser’s own category over a guess from the title', () => {
    const event = {
      title: 'Eira’s Halloween Jamming Session',
      venue: 'Roast N Toast',
      category: 'nightlife',
    };
    expect(inferCategory(event)?.slug).toBe('nightlife');
  });

  it('falls back to the title when no category was chosen', () => {
    expect(inferCategory({ title: 'Stand-up night', category: '' })?.slug).toBe('comedy');
  });

  it('ignores an unknown slug rather than inventing a chip', () => {
    expect(inferCategory({ title: 'Quiet evening', category: 'not-a-slug' })).toBeNull();
  });
});
