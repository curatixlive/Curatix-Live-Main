'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Handshake,
  Ticket,
} from 'lucide-react';
import { Container } from '@/components/shell/container';
import { PartnerArt } from './partner-art';
import {
  PARTNER_CARDS,
  PARTNER_ROTATION_MS,
  PARTNER_SEQUENCE,
  cardAt,
  firstPositionOf,
  type PartnerCardId,
} from '@/lib/discovery/partner-cards';
import { cn } from '@/lib/utils/cn';

/**
 * Section D: the Organiser / Venue partner / Event sponsor carousel.
 *
 * One prominent card at a time on a phone; from `lg` the same carousel shows
 * the active card large with the other two beside it as selectable previews, so
 * a wide screen sees all three options at once without a second layout to keep
 * in step.
 *
 * The rotation order and its weighting are `PARTNER_SEQUENCE` — see
 * `lib/discovery/partner-cards.ts`. This component only walks it.
 *
 * Motion rules: it advances on its own every `PARTNER_ROTATION_MS`, but stops
 * while the pointer is over it or focus is inside it, once somebody has swiped
 * or pressed an arrow, whenever it is off-screen or the tab is hidden, and
 * permanently under `prefers-reduced-motion`. Swiping works on touch; the
 * buttons and the dots work from the keyboard.
 */

const ICONS: Record<PartnerCardId, React.ComponentType<{ className?: string }>> = {
  organiser: Ticket,
  venue: Building2,
  sponsor: Handshake,
};

const SWIPE_PX = 40;

export function PartnerCarousel() {
  const length = PARTNER_SEQUENCE.length;
  const [position, setPosition] = React.useState(0);
  const [engaged, setEngaged] = React.useState(false);
  const [handedOver, setHandedOver] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const [tabHidden, setTabHidden] = React.useState(false);
  const [reduced, setReduced] = React.useState(false);
  const rootRef = React.useRef<HTMLElement>(null);
  const touchX = React.useRef<number | null>(null);
  const active = cardAt(position);

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      {
        threshold: 0.2,
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const onChange = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const running = !reduced && !engaged && !handedOver && visible && !tabHidden;

  React.useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setPosition((p) => (p + 1) % length), PARTNER_ROTATION_MS);
    return () => window.clearTimeout(id);
  }, [running, position, length]);

  const go = (next: number) => {
    setHandedOver(true);
    setPosition(((next % length) + length) % length);
  };

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label="Partner with Curatix"
      className="py-section lg:py-section-lg"
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={() => setEngaged(false)}
      onTouchStart={(event) => {
        touchX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchX.current;
        touchX.current = null;
        const end = event.changedTouches[0]?.clientX;
        if (start === null || end === undefined) return;
        const delta = end - start;
        if (Math.abs(delta) >= SWIPE_PX) go(position + (delta < 0 ? 1 : -1));
      }}
    >
      <Container>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ActiveCard key={active.id} id={active.id} />

          {/* From `lg`: all three options, the active one marked. Below `lg` the
              same three are dots, so every card stays manually reachable. */}
          <ul className="hidden flex-col gap-3 lg:flex" aria-label="Partner options">
            {(['organiser', 'venue', 'sponsor'] as const).map((id) => {
              const card = PARTNER_CARDS[id];
              const Icon = ICONS[id];
              const current = active.id === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => go(firstPositionOf(id))}
                    aria-current={current ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors motion-reduce:transition-none',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      current
                        ? 'border-foreground/40 bg-muted'
                        : 'border-border bg-surface hover:bg-muted/60',
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/10">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{card.eyebrow}</span>
                      <span className="line-clamp-1 block text-xs text-muted-foreground">
                        {card.title}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-4 flex items-center justify-center gap-3 lg:hidden">
          <ArrowButton label="Previous partner option" onClick={() => go(position - 1)}>
            <ChevronLeft className="size-5" aria-hidden />
          </ArrowButton>
          <div role="group" aria-label="Choose partner option" className="flex">
            {(['organiser', 'venue', 'sponsor'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => go(firstPositionOf(id))}
                aria-label={`Show: ${PARTNER_CARDS[id].eyebrow}`}
                aria-current={active.id === id ? 'true' : undefined}
                className="flex size-9 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    'h-1.5 rounded-full bg-foreground/25 transition-all duration-base motion-reduce:transition-none',
                    active.id === id ? 'w-6 bg-foreground' : 'w-1.5',
                  )}
                />
              </button>
            ))}
          </div>
          <ArrowButton label="Next partner option" onClick={() => go(position + 1)}>
            <ChevronRight className="size-5" aria-hidden />
          </ArrowButton>
        </div>

        {/* The announcement a screen reader gets when it changes by itself. */}
        <p className="sr-only" aria-live={running ? 'off' : 'polite'}>
          {active.eyebrow}
        </p>
      </Container>
    </section>
  );
}

function ArrowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full border border-border bg-surface transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

/** Keyed by card id so a change of card is a fresh mount and plays the entrance. */
function ActiveCard({ id }: { id: PartnerCardId }) {
  const card = PARTNER_CARDS[id];
  const Icon = ICONS[id];
  return (
    <article
      aria-roledescription="slide"
      className="relative isolate flex min-h-[19rem] animate-fade-rise flex-col justify-between gap-8 overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 to-ink-950 p-6 text-white motion-reduce:animate-none sm:min-h-[22rem] sm:p-10"
    >
      {/* The artwork: a drawn concept scene per card (see partner-art.tsx), kept to
          the right so the words keep a calm field. Faint on a phone, where the
          text spans the whole card. */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 -z-20 w-full opacity-40 sm:w-[68%] sm:opacity-100"
      >
        <PartnerArt id={id} />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-ink-950 via-ink-950/50 to-transparent sm:via-ink-950/20"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-ink-950/70 to-transparent sm:hidden"
      />
      <div className="flex flex-col gap-4">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/25 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/85">
          <Icon className="size-3.5" aria-hidden />
          {card.eyebrow}
        </span>
        <h2 className="max-w-xl text-balance text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          {card.title}
        </h2>
        <p className="max-w-xl text-pretty text-sm text-white/80 sm:text-base">{card.body}</p>
      </div>
      <div>
        <Link
          href={card.cta.href}
          className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:transition-none"
        >
          {card.cta.label}
          <ArrowUpRight
            className="size-4 transition-transform duration-base group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden
          />
        </Link>
      </div>
    </article>
  );
}
