'use client';

import * as React from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EventCard as EventCardModel } from '@/lib/api/types';
import { useEventsInfinite, type SeededEventPages } from '@/lib/api/hooks/use-events';
import { useOnline } from '@/lib/utils/use-online';
import { useDebouncedValue } from '@/lib/utils/use-debounced-value';
import type { DateWindowId } from '@/lib/discovery/date-windows';
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  applyRefinement,
  toServerQuery,
  type SortId,
} from '@/lib/discovery/filters';
import { cn } from '@/lib/utils/cn';
import { EventGrid, EventGridSkeleton } from './event-grid';

/**
 * EXPLORE EVENTS — the filterable list on the homepage.
 *
 * It does not invent a second filtering system. Everything goes through the
 * browse page's own vocabulary (`DiscoveryFilters` → `toServerQuery`), so a
 * result here is the result `/events` would give for the same filters:
 *
 *   search      → `q`   (Postgres full-text on title, venue, city, description)
 *   city        → `city`
 *   category    → one more stem in `q` (events have no category column yet, so a
 *                  category IS a search term — the existing, documented interim)
 *   date window → `starts_after` / `starts_before`, IST day boundaries
 *   sort        → "Soonest" is the server's order. Price sorts reorder the rows
 *                  ALREADY LOADED (the API has no price sort), and the control
 *                  says so rather than implying it sorted everything.
 *
 * Pagination is the API's cursor, one "Load more" at a time — the browser never
 * holds the catalogue. The first page arrives server-rendered and seeds the
 * query ONLY while no filter is set: a seed under the wrong key would show the
 * previous filter's results.
 */

export type ExploreCategory = { slug: string; label: string; term: string };

const WINDOWS: { id: DateWindowId | null; label: string }[] = [
  { id: null, label: 'Any date' },
  { id: 'today', label: 'Today' },
  { id: 'weekend', label: 'This weekend' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
];

const PAGE_SIZE = 12;

export function ExploreEventsClient({
  categories,
  cities,
  seed,
}: {
  categories: ExploreCategory[];
  cities: string[];
  seed: SeededEventPages | null;
}) {
  const [term, setTerm] = React.useState('');
  const [city, setCity] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [when, setWhen] = React.useState<DateWindowId | null>(null);
  const [sort, setSort] = React.useState<SortId>('soonest');
  const online = useOnline();

  const debounced = useDebouncedValue(term.trim(), 300);
  const activeCategory = categories.find((c) => c.slug === category) ?? null;
  const filtered = Boolean(debounced || city || activeCategory || when);

  const query = React.useMemo(
    () => ({
      ...toServerQuery({
        ...EMPTY_FILTERS,
        q: [debounced, activeCategory?.term].filter(Boolean).join(' '),
        city: city || null,
        when,
      }),
      page_size: PAGE_SIZE,
    }),
    [debounced, activeCategory, city, when],
  );

  const results = useEventsInfinite(query, {
    initialData: filtered ? undefined : (seed ?? undefined),
  });

  const events: EventCardModel[] = React.useMemo(
    () =>
      applyRefinement(results.data?.pages.flatMap((page) => page.data) ?? [], {
        ...EMPTY_FILTERS,
        sort,
      }),
    [results.data, sort],
  );

  const clear = () => {
    setTerm('');
    setCity('');
    setCategory('');
    setWhen(null);
    setSort('soonest');
  };
  const anyControl = filtered || sort !== 'soonest' || term !== '';
  const busy = results.isFetching && !results.isFetchingNextPage;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Search, city, sort ───────────────────────────────────────────── */}
      <form
        role="search"
        onSubmit={(event) => event.preventDefault()}
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_13rem]"
      >
        <div className="relative">
          <label htmlFor="explore-search" className="sr-only">
            Search events by name
          </label>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id="explore-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search events, artists, venues"
            autoComplete="off"
            className="h-12 w-full rounded-full border border-border bg-surface pl-12 pr-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {cities.length ? (
          <div>
            <label htmlFor="explore-city" className="sr-only">
              City
            </label>
            <select
              id="explore-city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="h-12 w-full rounded-full border border-border bg-surface px-4 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All cities</option>
              {cities.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label htmlFor="explore-sort" className="sr-only">
            Sort events
          </label>
          <select
            id="explore-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortId)}
            className="h-12 w-full rounded-full border border-border bg-surface px-4 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.id === 'soonest' ? option.label : `${option.label} (loaded events)`}
              </option>
            ))}
          </select>
        </div>
      </form>

      {/* ── Category and date chips ──────────────────────────────────────── */}
      {categories.length ? (
        <ChipRow label="Category">
          <Chip active={category === ''} onClick={() => setCategory('')}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c.slug} active={category === c.slug} onClick={() => setCategory(c.slug)}>
              {c.label}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
      <ChipRow label="Date">
        {WINDOWS.map((w) => (
          <Chip key={w.label} active={when === w.id} onClick={() => setWhen(w.id)}>
            {w.label}
          </Chip>
        ))}
      </ChipRow>

      <div className="flex min-h-9 items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {results.isPending
            ? 'Loading events…'
            : results.isError
              ? ''
              : events.length
                ? `${events.length}${results.hasNextPage ? '+' : ''} event${events.length === 1 ? '' : 's'}`
                : ''}
        </p>
        {anyControl ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="size-4" aria-hidden />
            Clear filters
          </Button>
        ) : null}
      </div>

      {/* ── Results, with every state ────────────────────────────────────── */}
      <div
        aria-busy={busy}
        className={cn('transition-opacity motion-reduce:transition-none', busy && 'opacity-60')}
      >
        {results.isPending ? (
          <EventGridSkeleton count={6} />
        ) : results.isError ? (
          <StateCard
            title={online ? "We couldn't load events just now" : "You're offline"}
            body={
              online
                ? 'Something went wrong on our side. Try again in a moment.'
                : 'Check your connection. Your filters are kept.'
            }
            action={
              <Button onClick={() => void results.refetch()} variant="outline">
                Try again
              </Button>
            }
          />
        ) : events.length ? (
          <EventGrid
            events={events}
            priorityCount={0}
            // Fill the band: 2 / 3 / 4 equal columns. Browse keeps its fixed-width
            // cards (a working surface); the front page is a shop window.
            className="sm:grid-cols-2 sm:justify-stretch md:grid-cols-3 lg:grid-cols-4"
          />
        ) : (
          <StateCard
            title={filtered ? 'No events match those filters' : 'No events on sale just yet'}
            body={
              filtered
                ? 'Try a different date or city, or clear the filters to see everything.'
                : 'New events are added regularly. Check back soon.'
            }
            action={
              filtered ? (
                <Button onClick={clear} variant="outline">
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      {results.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="lg"
            onClick={() => void results.fetchNextPage()}
            disabled={results.isFetchingNextPage}
          >
            {results.isFetchingNextPage ? (
              <>
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                Loading…
              </>
            ) : (
              'Load more events'
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-transparent bg-cta text-cta-foreground'
          : 'border-border bg-surface text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function StateCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <h3 className="text-h4">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
