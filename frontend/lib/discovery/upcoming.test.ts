import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURED_COUNT, HOME_UPCOMING_SIZE, featuredFrom } from './upcoming';

/**
 * "FEATURED EVENTS" — where it gets its events.
 *
 * It used to be strictly the first five of the shared list, and this file pinned
 * that so the hero and the grid could not disagree about what was on next.
 *
 * The homepage redesign changed the contract on purpose: Featured is now its own
 * section, directly under the hero, and shows what an operator FEATURED in the
 * CMS first (the Studio has always had that control — the page had stopped
 * reading it, so an operator's pin went nowhere). Only when nothing is featured
 * does it fall back to the soonest events, which is the old rule. The Explore
 * list below it is a filterable surface of its own, so the two no longer claim
 * to be the same list.
 *
 * What must still hold, and is pinned below: the fallback goes through the ONE
 * shared query (never its own fetch), and the order is never re-sorted. Every
 * assertion here fails silently if it regresses.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('featuredFrom', () => {
  it('takes the first five, in the order the server sent', () => {
    const events = Array.from({ length: 12 }, (_, index) => `event-${index}`);
    expect(featuredFrom(events)).toEqual(['event-0', 'event-1', 'event-2', 'event-3', 'event-4']);
  });

  it('returns what there is when there are fewer than five', () => {
    expect(featuredFrom(['only'])).toEqual(['only']);
    expect(featuredFrom([])).toEqual([]);
  });

  it('never re-sorts', () => {
    // The ORDER is the server's (`PUBLIC_LIST_ORDERING`). A second sort here
    // would be a second source of truth for it.
    expect(featuredFrom(['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('is five, and fits inside the shared page', () => {
    expect(FEATURED_COUNT).toBe(5);
    expect(FEATURED_COUNT).toBeLessThanOrEqual(HOME_UPCOMING_SIZE);
  });
});

describe('both sections read the same query', () => {
  it('Featured reads fetchUpcomingEvents and not its own list', () => {
    const source = read('components/discovery/showcase.tsx');
    expect(source).toContain('fetchUpcomingEvents()');
    expect(source).toContain('featuredFrom(');
    // Its own fetch is the way it used to drift from the grid.
    expect(source).not.toContain('fetchEventsSafe(');
    // The operator's featured collection leads; the shared list is the fallback.
    expect(source).toContain('collections?.featured');
    expect(source.indexOf('collections?.featured')).toBeLessThan(source.indexOf('featuredFrom('));
  });

  it('All Events reads the same call', () => {
    const source = read('components/discovery/all-events.tsx');
    expect(source).toContain('fetchUpcomingEvents()');
    expect(source).not.toContain('fetchEventsSafe(');
  });
});
