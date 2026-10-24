'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Baby,
  Building2,
  Headphones,
  Hourglass,
  Languages,
  Navigation,
  PawPrint,
  ShieldCheck,
  Sofa,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { fetchEventOffersSafe } from '@/lib/api/events';
import type { EventDetail, PublicOffer } from '@/lib/api/types';
import { formatMoney } from '@/lib/discovery/format';
import { cn } from '@/lib/utils/cn';

/**
 * The pieces of the "scene" event layout: a compact, dark, card-led page that a
 * thumb can read top to bottom — title, when and where, a tab strip, offers,
 * about, a grid of key facts, photographs, venue, help and terms.
 *
 * Everything here renders only what the platform actually knows. A fact with
 * no column behind it is ABSENT, not shown as "No" — an absent tag means the
 * organiser did not say, which is not the same as the answer being no.
 */

/* -------------------------------------------------------------------------- */
/* Directions                                                                 */
/* -------------------------------------------------------------------------- */

export function directionsUrl(event: {
  venue: string;
  city: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
}): string {
  const pinned =
    event.latitude !== null &&
    event.latitude !== undefined &&
    event.longitude !== null &&
    event.longitude !== undefined;
  const query = pinned ? `${event.latitude},${event.longitude}` : `${event.venue}, ${event.city}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function DirectionsButton({
  event,
  className,
}: {
  event: {
    venue: string;
    city: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
  };
  className?: string;
}) {
  return (
    <a
      href={directionsUrl(event)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Directions to ${event.venue}`}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Navigation className="size-5" aria-hidden />
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab strip                                                                  */
/* -------------------------------------------------------------------------- */

export type SceneTab = { id: string; label: string };

/**
 * A pill strip that scrolls to a section and follows the reader as they scroll.
 * Only tabs whose section exists are passed in, so no tab leads nowhere.
 */
export function SceneTabs({ tabs }: { tabs: SceneTab[] }) {
  const [active, setActive] = React.useState(tabs[0]?.id ?? '');
  const jumping = React.useRef(false);

  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const nodes = tabs
      .map((tab) => document.getElementById(tab.id))
      .filter((node): node is HTMLElement => Boolean(node));
    if (nodes.length === 0) return;
    const root = nodes[0]!.closest<HTMLElement>('[data-deck-scroller]');
    const observer = new IntersectionObserver(
      (entries) => {
        if (jumping.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { root, rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [tabs]);

  if (tabs.length < 2) return null;

  const go = (id: string) => {
    setActive(id);
    jumping.current = true;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      jumping.current = false;
    }, 700);
  };

  return (
    <nav
      aria-label="Sections"
      className="flex items-center gap-1 rounded-full border border-border bg-surface p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => go(tab.id)}
          aria-current={active === tab.id ? 'true' : undefined}
          className={cn(
            'min-h-10 flex-1 rounded-full px-3 text-body-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            active === tab.id
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Offers                                                                     */
/* -------------------------------------------------------------------------- */

function offerHeadline(offer: PublicOffer): string {
  if (offer.kind === 'percent') {
    const pct = `${Math.trunc(offer.value)}% off`;
    return offer.max_discount_minor ? `${pct} upto ${formatMoney(offer.max_discount_minor)}` : pct;
  }
  return `${formatMoney(Math.trunc(offer.value))} off`;
}

/**
 * The offers organisers have advertised for this event. Absent when there are
 * none — most events run no codes, and a blank "Offers" heading reads as an
 * organiser who forgot. Never throws: the fetch swallows its own failures.
 */
export function OffersCard({ eventId }: { eventId: string }) {
  const { data: offers = [] } = useQuery({
    queryKey: ['event-widget', 'offers', eventId],
    queryFn: () => fetchEventOffersSafe(eventId),
    staleTime: 30_000,
    retry: 0,
  });
  const [index, setIndex] = React.useState(0);
  if (offers.length === 0) return null;
  const offer = offers[index % offers.length]!;

  return (
    <section aria-labelledby="scene-offers" className="flex flex-col gap-3">
      <h3 id="scene-offers" className="text-h4 text-foreground">
        Offers on booking
      </h3>
      <button
        type="button"
        onClick={() => setIndex((i) => (i + 1) % offers.length)}
        aria-label={
          offers.length > 1 ? `Offer ${index + 1} of ${offers.length}. Show the next` : undefined
        }
        className="flex w-full items-center gap-3 rounded-2xl border border-success/30 bg-success/10 p-3.5 text-left"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/20 text-success">
          <Tag className="size-5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body-sm font-bold text-foreground">
            {offerHeadline(offer)}
          </span>
          <span className="truncate text-caption text-muted-foreground">
            use <span className="font-semibold text-foreground">{offer.code}</span>
          </span>
        </span>
        {offers.length > 1 ? (
          <span className="shrink-0 text-caption font-bold tabular-nums text-foreground">
            {(index % offers.length) + 1}/{offers.length}
          </span>
        ) : null}
      </button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Key facts                                                                  */
/* -------------------------------------------------------------------------- */

type Fact = { icon: LucideIcon; label: string; value: string };

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} mins`;
  return rest === 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${hours}h ${rest}m`;
}

/** The facts the platform really holds. Order is the order people ask. */
export function eventFacts(detail: EventDetail | null): Fact[] {
  if (!detail) return [];
  const tags = new Set(detail.tags ?? []);
  const facts: Fact[] = [];
  if (detail.language?.trim()) {
    facts.push({ icon: Languages, label: 'Language', value: detail.language.trim() });
  }
  const setting = ['indoor', 'outdoor', 'rooftop', 'online'].find((t) => tags.has(t));
  if (setting) {
    facts.push({
      icon: Building2,
      label: 'Layout',
      value: setting.charAt(0).toUpperCase() + setting.slice(1),
    });
  }
  if (detail.duration_minutes) {
    facts.push({
      icon: Hourglass,
      label: 'Duration',
      value: durationLabel(detail.duration_minutes),
    });
  }
  if (detail.age_restriction?.trim()) {
    facts.push({ icon: ShieldCheck, label: 'Age', value: detail.age_restriction.trim() });
  }
  if (tags.has('kid-friendly') || tags.has('family-friendly')) {
    facts.push({ icon: Baby, label: 'Kid friendly', value: 'Yes' });
  }
  if (tags.has('pet-friendly')) {
    facts.push({ icon: PawPrint, label: 'Pet friendly', value: 'Yes' });
  }
  if (tags.has('limited-seats')) {
    facts.push({ icon: Sofa, label: 'Seating', value: 'Limited seats' });
  }
  return facts;
}

export function FactsGrid({ detail }: { detail: EventDetail | null }) {
  const facts = eventFacts(detail);
  if (facts.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-2xl border border-border bg-surface p-4">
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <fact.icon className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col">
            <dt className="truncate text-caption text-muted-foreground">{fact.label}</dt>
            <dd className="truncate text-body-sm font-semibold text-foreground">{fact.value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------------------- */
/* Small furniture                                                            */
/* -------------------------------------------------------------------------- */

/** "CHECK OUT THE VIBE": a quiet divider that introduces the photographs. */
export function VibeDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3" role="presentation">
      <span className="h-px flex-1 bg-border" />
      <span className="text-caption font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** The help card: a real route to a person, not a chat widget we do not have. */
export function HelpCard() {
  return (
    <Link
      href="/support"
      className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-3.5 transition-colors hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
        <Headphones className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-body-sm font-semibold text-foreground">
        Have queries or need help with something? Hit us up
      </span>
    </Link>
  );
}
