import * as React from 'react';
import { Suspense } from 'react';
import { BrandHero } from '@/components/discovery/brand-hero';
import { CuratedRail } from '@/components/discovery/curated-rail';
import { ExploreEvents } from '@/components/discovery/explore-events';
import { AllEventsSkeleton } from '@/components/discovery/all-events';
import { HighlightsShowcase } from '@/components/discovery/highlights-showcase';
import { LocationPrompt } from '@/components/discovery/location-prompt';
import { PartnerCarousel } from '@/components/discovery/partner-carousel';
import { PromoHero } from '@/components/discovery/promo-hero';
import { Showcase } from '@/components/discovery/showcase';
import { Section } from '@/components/discovery/section';
import { SubscribeCard } from '@/components/discovery/subscribe-card';
import { SellingFastSection } from '@/components/discovery/home-sections';
import { WhyCuratix } from '@/components/discovery/why-curatix';
import { HireABandSection } from '@/components/hire/hire-a-band-section';
import { fetchHomepageSafe } from '@/lib/api/cms';
import { activeCampaigns } from '@/lib/discovery/promo';

/**
 * THE LANDING PAGE'S BODY — mounted in two places, written once.
 *
 * ── WHY IT LEFT `app/(site)/page.tsx` ────────────────────────────────────
 *
 * An organizer pressing Home in their bottom bar used to be sent to `/`, which
 * is a different route GROUP: the attendee shell took over, so the four-tab
 * public bar (Home, Events, Saved, Hire) replaced the organizer's own and they
 * had left the product. The landing page is now rendered INSIDE the dashboard
 * at `/dashboard/home`, where the organizer chrome stays put.
 *
 * That needs the same page in two route groups, and this is the one copy of
 * it. A second arrangement of these nine sections for the organizer's version
 * is the drift this codebase refuses everywhere else: it would look identical
 * the week it was written and diverge on the first change to either.
 *
 * ── WHAT IS NOT IN HERE ──────────────────────────────────────────────────
 *
 * The `WebSite` JSON-LD and the canonical stay on the public route. They are
 * claims about `/` — a search engine must not be told that the copy behind an
 * organizer's login is the same document, and the dashboard is `noindex`
 * anyway.
 *
 * ── RECOMMEND, THEN LIST, THEN NAVIGATE ───────────────────────────────────
 *
 *   hero          ONE event, full width, with its own colour   (recommend)
 *   all events    chips + a poster grid of what is on sale     (list)
 *   categories    eight ways in for somebody with no plan      (navigate)
 *   HIRE A BAND   the second product, its own band             (the other job)
 *   why / signup  the trust argument and the one ask           (last)
 *
 * That order is the whole layout argument. A visitor arrives in one of three
 * states — "show me something good", "show me what's on", "I know roughly what
 * I want" — and each of the first three blocks answers exactly one of them, in
 * descending order of how many people are in that state.
 *
 * This page used to open on a marquee of five posters and then run more rails
 * under it: featured, then trending, each the same card doing the same job
 * under a different heading. Repeating a card is how a page gets long without
 * getting more useful. There is now ONE recommendation surface (the hero,
 * which commits to a single event and can therefore give it a date, a venue, a
 * price and a CTA) and ONE listing surface (`AllEvents`, a grid carrying the
 * browse page's own filter vocabulary).
 */
export async function HomeBody() {
  // Server-side, ISR'd and NEVER throws — the hero is the LCP element, and a
  // failing upstream must not take the front page down.
  const cms = await fetchHomepageSafe();
  // Published, approved, in-window ads only (the backend already filtered; this
  // is the second check, because the response may have sat in an edge cache).
  const ads = activeCampaigns(cms?.campaigns);

  return (
    <>
      {/* ── THE DOCUMENT'S ONE h1, AND IT IS NOT DRAWN ───────────────────
          The biggest text on the first screen is an advertisement's or the
          brand hero's headline, and either changes (a carousel press, an
          operator edit). A document whose heading mutates has no stable
          outline for a screen reader or a crawler, so the h1 is real, first in
          the document, visually hidden, and names the PAGE. Every section
          below is an h2 under it. */}
      <h1 className="sr-only">Live events, concerts and experiences in India</h1>

      {/* A. THE HERO. Advertisements an operator published, or — when there are
          none — the Curatix brand hero, so the first screen is never an empty
          carousel. Ads and events are different things: an ad may link to an
          event but is never drawn as one. */}
      {ads.length ? <PromoHero campaigns={ads} /> : <BrandHero hero={cms?.hero} />}

      {/* B. FEATURED EVENTS — the operator's featured collection, else the
          soonest upcoming. */}
      <Showcase cms={cms} />

      {/* C. EXPLORE — search, city, category and date filters over the real
          events API, with cursor pagination. */}
      <Suspense fallback={<AllEventsSkeleton />}>
        <ExploreEvents cms={cms} />
      </Suspense>

      {/* D. PARTNER CAROUSEL — organiser (most often), venue partner, sponsor. */}
      <PartnerCarousel />

      {/* E. RELIVE THE HIGHLIGHTS — video from events that have happened. */}
      <HighlightsShowcase highlights={cms?.highlights} />

      {/* ── EVERYTHING BELOW IS THE REST OF THE PAGE, in its old order ────────
          Operator-curated collections hide themselves when empty, and "selling
          fast" only appears when something genuinely is. */}
      <CuratedRail
        collections={cms?.collections}
        collection="editors_pick"
        title="Editor's picks"
        subtitle="Chosen by our team"
      />
      <CuratedRail
        collections={cms?.collections}
        collection="recommended"
        title="Recommended for you"
        subtitle="Hand-picked by our team"
      />
      <CuratedRail
        collections={cms?.collections}
        collection="new"
        title="New on Curatix"
        subtitle="Recently added to the platform"
      />

      <Suspense fallback={null}>
        <SellingFastSection />
      </Suspense>

      <LocationPrompt />

      <HireABandSection />

      <WhyCuratix />

      <Section>
        <SubscribeCard />
      </Section>
    </>
  );
}
