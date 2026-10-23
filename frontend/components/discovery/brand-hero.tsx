import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { Aurora } from '@/components/discovery/aurora';
import { Container } from '@/components/shell/container';
import type { Homepage } from '@/lib/api/cms';

/**
 * The Curatix hero — what the top of the homepage shows when no advertisement
 * is published, so the first screen is never an empty carousel.
 *
 * It is a real entry point, not a banner: a search box that submits to the
 * existing `/events?q=` browse page, and two buttons that go to routes that
 * exist. The headline and sentence come from the operator-edited homepage
 * record when set; the defaults below are brand copy, not claims — nothing here
 * states a number, a rating or an event.
 *
 * Dark in both themes on purpose: it is an object on the page, like the ticket,
 * not a surface that should invert when somebody flips the toggle.
 */

const DEFAULT_HEADLINE = 'Your next great night out starts here';
const DEFAULT_BODY =
  'Concerts, comedy, workshops, festivals and more across India — plus performers to hire for your own event.';

export function BrandHero({ hero }: { hero?: Homepage['hero'] | null }) {
  const headline = hero?.headline?.trim() || DEFAULT_HEADLINE;
  const body = hero?.description?.trim() || DEFAULT_BODY;
  const placeholder = hero?.search_placeholder?.trim() || 'Search events, artists, venues';

  return (
    <section aria-label="Welcome" className="pt-3 sm:pt-5">
      <Container>
        <div className="relative isolate overflow-hidden rounded-3xl bg-ink-900 px-5 py-10 text-white shadow-sm sm:px-10 sm:py-14 lg:px-16 lg:py-20">
          <Aurora />
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Live events · Experiences · Performers
            </p>
            <h2 className="text-balance text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              {headline}
            </h2>
            <p className="max-w-xl text-pretty text-sm text-white/80 sm:text-lg">{body}</p>

            <form
              action="/events"
              method="get"
              role="search"
              className="mt-2 flex w-full max-w-lg gap-2"
            >
              <label htmlFor="hero-search" className="sr-only">
                Search events
              </label>
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/60"
                  aria-hidden
                />
                <input
                  id="hero-search"
                  name="q"
                  type="search"
                  autoComplete="off"
                  placeholder={placeholder}
                  className="h-12 w-full rounded-full border border-white/20 bg-white/10 pl-12 pr-4 text-base text-white placeholder:text-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                />
              </div>
              <button
                type="submit"
                className="h-12 shrink-0 rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:transition-none"
              >
                Search
              </button>
            </form>

            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <Link
                href="/events"
                className="inline-flex min-h-11 items-center gap-1.5 font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Explore all events
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/organizer"
                className="inline-flex min-h-11 items-center gap-1.5 text-white/80 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Host an event
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
