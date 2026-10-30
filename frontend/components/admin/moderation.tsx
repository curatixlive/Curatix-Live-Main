'use client';

import * as React from 'react';
import Image from 'next/image';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowUpRight, ExternalLink, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { fetchModerationQueue, type ModerationEntry, type ModerationStatus } from '@/lib/api/admin';
import { useConsoleEventDateWindow } from '@/components/admin/filters';
import { FilterChips, SearchField } from '@/components/organizer/filters';
import { TableToolbar } from '@/components/organizer/data-table';
import { useDebouncedValue } from '@/lib/utils/use-debounced-value';
import { adminQueryKeys } from '@/lib/admin/query-keys';
import { cursorFromNextLink } from '@/lib/api/events';
import { Button } from '@/components/ui/button';
import {
  EmptyState,
  ErrorState,
  Panel,
  Skeleton,
  StatusPill,
} from '@/components/organizer/primitives';
import { cn } from '@/lib/utils/cn';

/**
 * Every event on the platform, by status — a browser, not a review queue.
 *
 * Events no longer wait for approval: an organisation that has been VERIFIED
 * publishes straight to live (`EventService.PUBLISH_STRAIGHT_TO_LIVE`), and
 * verification is the platform's one gate. What an operator keeps is the power
 * to act after the fact, from the event's console page: take it down, or remove
 * it with a reason the organiser is sent (which also refunds every booking).
 *
 * The row carries the poster, description, venue, date and the organisation's
 * verification level, so an operator scanning for a listing that should not be
 * here can spot it without opening each one.
 */

const TABS: { value: ModerationStatus; label: string; blurb: string }[] = [
  { value: 'live', label: 'On sale', blurb: 'Live now. Newest first.' },
  { value: 'paused', label: 'Paused', blurb: 'Sales paused by the organiser.' },
  { value: 'finished', label: 'Finished', blurb: 'Already happened.' },
  { value: 'cancelled', label: 'Cancelled', blurb: 'Called off; bookings refunded.' },
  { value: 'archived', label: 'Archived', blurb: 'Retired by their organiser.' },
];

/**
 * The filter tab pill.
 *
 * The selected one is the BUTTER pill (`--nav-active`) — the design system's
 * one "you are here" signal, shared with the active nav item and every applied
 * filter. It is deliberately NOT the brand violet: a selected filter that is
 * filled with the accent reads as a button asking to be pressed, and on a
 * screen whose real actions publish events that ambiguity is expensive.
 *
 * 44px on a phone (the touch-target floor), 36px from `sm` up, where a mouse
 * does not need the extra 8px and a triage queue does.
 */
const tabClass = (active: boolean) =>
  cn(
    'inline-flex h-control items-center rounded-full border px-pill text-label sm:h-control-sm',
    'transition-colors duration-fast motion-reduce:transition-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active
      ? 'border-transparent bg-nav-active text-nav-active-foreground hover:bg-nav-active-hover'
      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
  );

export function ModerationQueue() {
  const [status, setStatus] = React.useState<ModerationStatus>('live');
  const [term, setTerm] = React.useState('');
  // Debounced, so typing does not fire a request per keystroke against a list
  // that also refetches on a 30-second interval.
  const search = useDebouncedValue(term.trim(), 250);
  const dates = useConsoleEventDateWindow();

  const query = useInfiniteQuery({
    // NOT ['admin', 'moderation', { status }] — that is the attention bar's
    // key, and a plain useQuery and a useInfiniteQuery sharing one key share
    // one cache entry with two incompatible shapes. See lib/admin/query-keys.
    queryKey: adminQueryKeys.moderationQueue(status, `${search}|${dates.key}`),
    queryFn: ({ pageParam }) =>
      fetchModerationQueue({
        status,
        q: search || undefined,
        ...dates.window,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => cursorFromNextLink(last.meta.next),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const rows = React.useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );
  const tab = TABS.find((entry) => entry.value === status) ?? TABS[0]!;

  return (
    <div className="flex flex-col gap-stack">
      <div role="tablist" aria-label="Filter events by status" className="flex flex-wrap gap-1.5">
        {TABS.map((entry) => (
          <button
            key={entry.value}
            role="tab"
            type="button"
            aria-selected={status === entry.value}
            onClick={() => setStatus(entry.value)}
            className={tabClass(status === entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <TableToolbar>
        <SearchField
          value={term}
          onChange={setTerm}
          placeholder="Event, venue, city or organiser"
          label="Search events"
        />
        {dates.control}
      </TableToolbar>

      {search || dates.label ? (
        <FilterChips
          chips={
            [
              search ? { key: 'q', label: `“${search}”`, onClear: () => setTerm('') } : null,
              dates.label ? { key: 'date', label: dates.label, onClear: dates.clear } : null,
            ].filter(Boolean) as { key: string; label: string; onClear: () => void }[]
          }
          onClearAll={() => {
            setTerm('');
            dates.clear();
          }}
        />
      ) : null}

      <Panel title={`${tab.label} events`} subtitle={tab.blurb}>
        {query.isError ? (
          <ErrorState message="Could not load events." onRetry={() => void query.refetch()} />
        ) : query.isPending ? (
          <div className="flex flex-col gap-stack p-card">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-32 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={`No ${tab.label.toLowerCase()} events`}
            body="Events appear here as soon as an organiser publishes them."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <ModerationRow key={row.id} row={row} />
            ))}
          </ul>
        )}

        {query.hasNextPage ? (
          <div className="border-t border-border p-3 text-center">
            <Button
              variant="outline"
              onClick={() => void query.fetchNextPage()}
              loading={query.isFetchingNextPage}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function ModerationRow({ row }: { row: ModerationEntry }) {
  return (
    <li className={cn('flex flex-col gap-stack p-card transition-colors')}>
      <div className="flex gap-stack-lg">
        <div className="relative hidden aspect-card w-40 shrink-0 overflow-hidden rounded-lg bg-muted sm:block">
          {row.poster_url ? (
            <Image src={row.poster_url} alt="" fill sizes="160px" className="object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-caption text-muted-foreground">
              No cover
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-body font-semibold">{row.title}</h3>
            {/* The first event from an unverified organisation is the one
                worth reading properly — so the level is on the row, not
                behind a click. */}
            <StatusPill tone={row.verified_level === 'verified' ? 'success' : 'warning'}>
              {row.verified_level === 'verified' ? 'Verified organiser' : 'Unverified organiser'}
            </StatusPill>
          </div>

          <p className="text-caption text-muted-foreground">
            {row.organization_name} · {row.venue}, {row.city} ·{' '}
            {new Date(row.starts_at).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>

          <p className="line-clamp-3 text-body-sm text-muted-foreground">
            {row.description || <span className="italic">No description provided.</span>}
          </p>

          {/* The organiser's own words, verbatim. Shown on a decided row
              because "why was this sent back" is the question asked of this
              tab, and making an operator remember is how the same event gets
              rejected twice for different reasons. */}
          {row.moderation_note ? (
            <p className="rounded-md border border-border bg-sunken px-2.5 py-1.5 text-caption text-muted-foreground">
              <span className="font-medium text-foreground">Note: </span>
              {row.moderation_note}
            </p>
          ) : null}

          {/* Only a LIVE event has a public page. Linking to one for a pending
              event would 404 — the public detail query filters on `live`, and
              previewing an unapproved event as an attendee needs a staff
              override the endpoint does not have (BACKLOG item 51). */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {/* The operator's own screen for this event: its analytics, an
                edit, and a delete. Always available — unlike the public page,
                it does not require the event to be live, and it is where the
                numbers behind a moderation decision actually live. */}
            <Link
              href={`/admin/events/${row.id}`}
              title="Analytics, edit, take down or remove with a reason"
              className="inline-flex w-fit items-center gap-1.5 text-caption text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open in console
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>

            {row.status === 'live' ? (
              <Link
                href={`/events/${row.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 text-caption text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                View the public page
                <ExternalLink className="size-3" aria-hidden />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
