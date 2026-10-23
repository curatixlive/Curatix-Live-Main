import * as React from 'react';
import Link from 'next/link';
import { Container } from '@/components/shell/container';
import type { Homepage } from '@/lib/api/cms';
import { featuredFrom, fetchUpcomingEvents } from '@/lib/discovery/upcoming';
import { eventToJsonLd } from '@/lib/discovery/seo';
import { JsonLd, eventItemListJsonLd } from '@/lib/seo/json-ld';
import { toEventCard } from './curated-rail';
import { PosterCard } from './poster-card';
import { Section, SectionHeader } from './section';
import { ScrollRail } from './scroll-rail';

/**
 * FEATURED EVENTS — the rail directly under the hero.
 *
 * Two sources, in this order, and the heading is the same for both (a section
 * whose title changes for a reason only the author can see is a section nobody
 * can learn):
 *
 *   1. What an operator FEATURED in the CMS (`collections.featured`, managed
 *      under Admin → Studio → Featured events). The studio has always offered
 *      this slot; the page had stopped reading it, which is the worst kind of
 *      CMS — one whose writes go nowhere. It reads it again.
 *   2. Otherwise the soonest upcoming events (`featuredFrom`), the same rows
 *      the Explore section lists, so the two can never disagree about what is
 *      on next.
 *
 * Server component: it only decides WHICH events and renders cards. The one
 * interactive part (the arrow buttons) is `ScrollRail`.
 *
 * With no events at all — a fresh platform — it offers the other side of the
 * marketplace instead of a rail of grey boxes.
 */

export async function Showcase({ cms }: { cms?: Homepage | null }) {
  // Never throws: the front page must survive an upstream that does not. The
  // identical call in `ExploreEvents`' server seed is memoised by Next.
  const { events: upcoming } = await fetchUpcomingEvents();
  const curated = (cms?.collections?.featured ?? []).map(toEventCard);
  const events = curated.length ? curated : featuredFrom(upcoming);
  const label = 'Featured events';

  if (!events.length) return <EmptyShowcase />;

  return (
    <Section id="featured" className="py-8 sm:py-10">
      {/* The crawler-facing mirror of the rail: the same events, in the same
          order, with the same names and prices, so the structured data cannot
          claim anything the page does not show. */}
      <JsonLd data={eventItemListJsonLd(label, events.map(eventToJsonLd))} />
      <SectionHeader
        title={label}
        subtitle="Picked by our team"
        href="/events"
        linkLabel="See all events"
      />
      <ScrollRail label={label}>
        {events.map((event, index) => (
          <li
            key={event.id}
            className="w-[62%] shrink-0 snap-start sm:w-[34%] lg:w-[23%] xl:w-[19%]"
          >
            <PosterCard
              event={event}
              allEvents={events}
              index={index}
              // The first screenful is above the fold at every width.
              priority={index < 3}
              sizes="(min-width: 1280px) 19vw, (min-width: 1024px) 23vw, (min-width: 640px) 34vw, 62vw"
            />
          </li>
        ))}
      </ScrollRail>
    </Section>
  );
}

/**
 * No events on the platform at all.
 *
 * Not a skeleton (nothing is loading), not a rail of grey placeholders (that
 * reads as broken rather than as new), and not invented cards. It is the one
 * honest thing a ticketing site with no tickets can offer: the other side of
 * the marketplace.
 */
function EmptyShowcase() {
  return (
    <Container className="py-10 sm:py-14">
      <div className="flex flex-col items-start gap-5 rounded-2xl border border-border bg-surface p-card-lg shadow-sm sm:p-8">
        <div className="flex max-w-xl flex-col gap-2">
          <h2 className="text-h3 font-extrabold tracking-tight text-foreground">
            Nothing on sale just yet
          </h2>
          <p className="text-body text-muted-foreground">
            The first events are being listed now. If you run one, this is a good moment to be the
            first thing people see.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/organizer"
            className="inline-flex h-control items-center rounded-full bg-cta px-pill text-label text-cta-foreground shadow-sm transition-colors duration-fast hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            List your event
          </Link>
          <Link
            href="/hire"
            className="inline-flex h-control items-center rounded-full border border-border bg-surface px-pill text-label text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Hire a performer
          </Link>
        </div>
      </div>
    </Container>
  );
}
