import * as React from 'react';
import type { Homepage } from '@/lib/api/cms';
import { fetchUpcomingEvents } from '@/lib/discovery/upcoming';
import { Section, SectionHeader } from './section';
import { ExploreEventsClient, type ExploreCategory } from './explore-events-client';

/**
 * Section C of the homepage. The server half: it picks the filter vocabulary
 * (the operator's categories and promoted cities) and seeds the list with the
 * first page, so the section has events in the HTML rather than a spinner.
 *
 * The seed is the SAME `fetchUpcomingEvents()` the Featured rail makes, which
 * Next memoises into one request.
 */
export async function ExploreEvents({ cms }: { cms: Homepage | null }) {
  const { events, next, error } = await fetchUpcomingEvents();

  const categories: ExploreCategory[] = (cms?.categories ?? []).map((c) => ({
    slug: c.slug,
    label: c.label,
    // A category is a search stem until events have a category column. The
    // operator's `search_term` wins; the label is the fallback.
    term: (c.search_term || c.label).trim(),
  }));
  const cities = (cms?.featured_cities ?? []).map((c) => c.name);

  const seed = error
    ? null
    : {
        pages: [{ data: events, meta: { next, previous: null } }],
        pageParams: [null as string | null],
      };

  return (
    <Section id="explore">
      <SectionHeader
        title="Find your next experience"
        subtitle="Search, filter and discover what's on"
      />
      <ExploreEventsClient categories={categories} cities={cities} seed={seed} />
    </Section>
  );
}
