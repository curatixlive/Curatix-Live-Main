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
import { fetchHomepageSafe, type Homepage, type PromoCampaign } from '@/lib/api/cms';
import { activeCampaigns } from '@/lib/discovery/promo';
import {
  type SectionConfig,
  type SectionKey,
  boolSetting,
  numberSetting,
  visibleSections,
} from '@/lib/discovery/sections';

/**
 * THE LANDING PAGE'S BODY — mounted in two places, written once.
 *
 * ── WHY IT LEFT `app/(site)/page.tsx` ────────────────────────────────────
 *
 * The landing page is the ATTENDEE site's alone. It was once also rendered inside
 * the organiser dashboard (at `/dashboard/home`) so a Home tab could show it
 * without swapping the shell; that put attendee content — posters, save buttons —
 * inside the organiser's console, and was removed. `/dashboard/home` now just
 * redirects to the organiser overview.
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
/**
 * How each section renders. A `Record<SectionKey, …>`, so adding a key to
 * `lib/discovery/sections.ts` without writing its renderer here does not compile —
 * and `sections.test.ts` ties that list to the backend registry, so a section
 * cannot exist without a switch, nor a switch without a section.
 *
 * Settings an operator tuned in the admin (a carousel's interval, autoplay on or
 * off) arrive here as `config.settings` and are passed to the component as props;
 * the components themselves know nothing about the CMS.
 */
type Context = { cms: Homepage | null; ads: PromoCampaign[]; config: SectionConfig };

const RENDER: Record<SectionKey, (ctx: Context) => React.ReactNode> = {
  // A. THE HERO. Advertisements an operator published, or — when there are none —
  // the Curatix brand hero, so the first screen is never an empty carousel. Ads
  // and events are different things: an ad may link to an event but is never
  // drawn as one. Turning "Promotions" off removes this whole slot.
  promotions: ({ cms, ads, config }) =>
    ads.length ? (
      <PromoHero
        campaigns={ads}
        intervalSeconds={numberSetting(config, 'interval_seconds', { min: 3, max: 30 })}
      />
    ) : (
      <BrandHero hero={cms?.hero} />
    ),

  // B. FEATURED EVENTS — the operator's featured collection, else the soonest.
  featured: ({ cms, config }) => (
    <Showcase
      cms={cms}
      autoscroll={boolSetting(config, 'autoscroll')}
      intervalSeconds={numberSetting(config, 'interval_seconds', { min: 2, max: 15 })}
    />
  ),

  // C. EXPLORE — search, city, category and date filters over the real events API,
  // with cursor pagination.
  explore: ({ cms }) => (
    <Suspense fallback={<AllEventsSkeleton />}>
      <ExploreEvents cms={cms} />
    </Suspense>
  ),

  // D. PARTNER CAROUSEL — organiser (most often), venue partner, sponsor.
  partners: () => <PartnerCarousel />,

  // E. RELIVE THE HIGHLIGHTS — video from events that have happened.
  highlights: ({ cms, config }) => (
    <HighlightsShowcase highlights={cms?.highlights} autoplay={boolSetting(config, 'autoplay')} />
  ),

  // Operator-curated collections hide themselves when empty (no placeholder, no
  // auto-filled substitute), so a switched-on section with nothing curated is
  // still absent rather than an empty box.
  editors_picks: ({ cms }) => (
    <CuratedRail
      collections={cms?.collections}
      collection="editors_pick"
      title="Editor's picks"
      subtitle="Chosen by our team"
    />
  ),
  recommended: ({ cms }) => (
    <CuratedRail
      collections={cms?.collections}
      collection="recommended"
      title="Recommended for you"
      subtitle="Hand-picked by our team"
    />
  ),
  new_arrivals: ({ cms }) => (
    <CuratedRail
      collections={cms?.collections}
      collection="new"
      title="New on Curatix"
      subtitle="Recently added to the platform"
    />
  ),

  // Only appears when something genuinely is running low.
  selling_fast: () => (
    <Suspense fallback={null}>
      <SellingFastSection />
    </Suspense>
  ),

  hire_a_band: () => <HireABandSection />,
  why_curatix: () => <WhyCuratix />,
  subscribe: () => (
    <Section>
      <SubscribeCard />
    </Section>
  ),
};

export async function HomeBody() {
  // Server-side, ISR'd and NEVER throws — the hero is the LCP element, and a
  // failing upstream must not take the front page down. If the configuration is
  // unavailable, `visibleSections` falls back to every section on, in default order.
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
          the document, visually hidden, and names the PAGE — and it stays even
          when every section is switched off. Every section is an h2 under it. */}
      <h1 className="sr-only">Live events, concerts and experiences in India</h1>

      {/* Visible sections only, in the operator's order. A hidden one is not
          rendered at all: no component, so no timer, no video, no request and no
          empty container or stray gap where it used to be. */}
      {visibleSections(cms?.sections).map((config) => (
        <React.Fragment key={config.key}>{RENDER[config.key]({ cms, ads, config })}</React.Fragment>
      ))}

      {/* A prompt, not a section: it renders nothing until it has something to ask. */}
      <LocationPrompt />
    </>
  );
}
