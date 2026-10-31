'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarDays,
  Building2,
  ExternalLink,
  Lock,
  MapPin,
  Pencil,
  QrCode,
  ReceiptText,
  Users,
} from 'lucide-react';
import { fetchCoHostedEvents, type CoHostedEvent } from '@/lib/api/event-access-admin';
import { RemoteImage } from '@/components/ui/remote-image';
import { formatEventDateTime, formatMoney } from '@/lib/discovery/format';
import { eventPath } from '@/lib/events/ref';
import { cn } from '@/lib/utils/cn';

/**
 * EVENTS YOU CO-HOST.
 *
 * A co-host is somebody the host trusts to run one night with them, so this is
 * drawn as the host's own event cards — poster, the headline numbers and every
 * action they are allowed — not as a list of links. The rule it follows is the
 * owner's: a co-host can do what an organiser can, EXCEPT the money.
 *
 * Money therefore follows `finance` and nothing else: revenue is only drawn when
 * the server sent a number, and a co-host without the right sees one plain line
 * saying so, rather than a "₹0" about a figure that was simply withheld.
 */

const STATUS_STYLE: Record<string, string> = {
  live: 'bg-success text-on-gradient',
  paused: 'bg-warning text-warning-foreground',
  draft: 'bg-surface/90 text-foreground',
  finished: 'bg-surface/90 text-foreground',
};

const actionClass = cn(
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-3 text-caption font-medium',
  'transition-colors duration-fast hover:bg-muted motion-reduce:transition-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

export function CoHostedEvents() {
  const events = useQuery({
    queryKey: ['organizer', 'cohosted-events'],
    queryFn: fetchCoHostedEvents,
    staleTime: 60_000,
  });
  const rows = events.data ?? [];
  if (!rows.length) return null;

  return (
    <section aria-label="Events you co-host" className="mb-8 flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-h4">Events you co-host</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-caption font-semibold text-primary">
            {rows.length}
          </span>
        </div>
        <p className="text-body-sm text-muted-foreground">
          You run these with the host. Everything is open to you except payouts and revenue.
        </p>
      </header>

      <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {rows.map((row) => (
          <CoHostCard key={row.event_id} row={row} />
        ))}
      </ul>
    </section>
  );
}

function CoHostCard({ row }: { row: CoHostedEvent }) {
  const sold = row.tickets_sold;
  const capacity = row.capacity;
  const fill = capacity > 0 ? Math.min(100, Math.round((sold / capacity) * 100)) : 0;

  const actions = [
    row.permissions.analytics && {
      href: `/dashboard/events/${row.event_id}/analytics`,
      label: 'Analytics',
      icon: BarChart3,
    },
    row.permissions.attendees && {
      href: `/dashboard/events/${row.event_id}/attendees`,
      label: 'Attendees',
      icon: Users,
    },
    row.permissions.bookings && {
      href: `/dashboard/bookings?event_id=${row.event_id}`,
      label: 'Bookings',
      icon: ReceiptText,
    },
    row.permissions.edit && {
      href: `/dashboard/events/${row.event_id}/edit`,
      label: 'Edit details',
      icon: Pencil,
    },
    row.permissions.checkin && {
      href: `/dashboard/check-in?event=${row.event_id}`,
      label: 'Scan tickets',
      icon: QrCode,
    },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Users }[];

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {/* ── THE POSTER ───────────────────────────────────────────────────── */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        <RemoteImage
          src={row.poster_url}
          alt=""
          className="size-full object-cover"
          fallback={
            <div
              aria-hidden
              className="flex size-full items-center justify-center bg-gradient-to-br from-primary via-primary/80 to-primary/55"
            >
              <CalendarDays className="size-10 text-white/60" />
            </div>
          }
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/20"
        />
        <span
          className={cn(
            'absolute left-3 top-3 rounded-full px-2.5 py-1 text-caption font-semibold capitalize shadow-sm',
            STATUS_STYLE[row.status] ?? 'bg-surface/90 text-foreground',
          )}
        >
          {row.status.replace(/_/g, ' ')}
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-caption font-medium text-foreground shadow-sm">
          Co-host
        </span>
        <p className="absolute inset-x-3 bottom-3 flex items-center gap-1.5 text-caption font-medium text-white">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          <time dateTime={row.starts_at}>{formatEventDateTime(row.starts_at)}</time>
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-card">
        {/* ── WHAT IT IS ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <h3 className="line-clamp-2 text-body font-semibold leading-snug">{row.title}</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Building2 className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">Hosted by {row.host}</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{[row.venue, row.city].filter(Boolean).join(', ')}</span>
            </span>
          </div>
        </div>

        {/* ── THE HEADLINE NUMBERS ──────────────────────────────────────── */}
        <div className="flex flex-col gap-3 rounded-xl bg-sunken p-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-caption text-muted-foreground">Tickets sold</p>
              <p className="text-h4 tabular-nums">
                {sold}
                <span className="text-body-sm font-normal text-muted-foreground">
                  {capacity > 0 ? ` / ${capacity}` : ''}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-caption text-muted-foreground">Checked in</p>
              <p className="text-h4 tabular-nums">{row.checked_in}</p>
            </div>
          </div>
          {capacity > 0 ? (
            <div
              role="progressbar"
              aria-label="Tickets sold"
              aria-valuemin={0}
              aria-valuemax={capacity}
              aria-valuenow={sold}
              className="h-1.5 overflow-hidden rounded-full bg-border"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${fill}%` }} />
            </div>
          ) : null}
          {row.revenue_minor !== null ? (
            <p className="flex items-center justify-between text-caption">
              <span className="text-muted-foreground">Revenue</span>
              <span className="font-semibold tabular-nums">{formatMoney(row.revenue_minor)}</span>
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <Lock className="size-3 shrink-0" aria-hidden />
              Revenue and payouts stay with the host.
            </p>
          )}
        </div>

        {/* ── WHAT YOU CAN DO ───────────────────────────────────────────── */}
        <div className="mt-auto grid grid-cols-2 gap-2">
          {actions.map(({ href, label, icon: Icon }) => (
            <Link key={label} href={href} className={actionClass}>
              <Icon className="size-3.5 shrink-0" aria-hidden /> {label}
            </Link>
          ))}
          <Link
            href={eventPath({ id: row.event_id })}
            className={cn(actionClass, 'text-muted-foreground')}
          >
            <ExternalLink className="size-3.5 shrink-0" aria-hidden /> View page
          </Link>
        </div>
      </div>
    </li>
  );
}
