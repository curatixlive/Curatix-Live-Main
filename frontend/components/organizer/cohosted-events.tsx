'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Building2, MapPin, Pencil, QrCode, ReceiptText, Users } from 'lucide-react';
import { fetchCoHostedEvents } from '@/lib/api/event-access-admin';
import { formatEventDateTime } from '@/lib/discovery/format';
import { cn } from '@/lib/utils/cn';

/**
 * Events somebody else has asked you to help run.
 *
 * Absent when there are none — most organisers co-host nothing, and an empty
 * "Events you co-host" card would read as something missing. Each link appears
 * only for what the host allowed: the pages would refuse the rest anyway, and a
 * link that leads to "not found" is worse than no link.
 */
const IST = 'Asia/Kolkata';

/** "DEC" / "10", read in Indian time like every other date on the platform. */
function dateTile(iso: string): { month: string; day: string } {
  const date = new Date(iso);
  return {
    month: date.toLocaleDateString('en-IN', { month: 'short', timeZone: IST }).toUpperCase(),
    day: date.toLocaleDateString('en-IN', { day: '2-digit', timeZone: IST }),
  };
}

const STATUS_STYLE: Record<string, string> = {
  live: 'bg-success-subtle text-success-subtle-foreground',
  paused: 'bg-warning-subtle text-warning-subtle-foreground',
};

const actionClass = cn(
  'inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-caption font-medium',
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
          The host gave you access. You can do what the buttons below allow, and nothing more.
        </p>
      </header>

      <ul className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => {
          const tile = dateTile(row.starts_at);
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
            <li
              key={row.event_id}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-card shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div
                  aria-hidden
                  className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary"
                >
                  <span className="text-[0.6875rem] font-semibold leading-none tracking-wide">
                    {tile.month}
                  </span>
                  <span className="mt-0.5 text-h4 leading-none">{tile.day}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-body font-semibold leading-snug">{row.title}</h3>
                  <p className="mt-1 text-caption text-muted-foreground">
                    <time dateTime={row.starts_at}>{formatEventDateTime(row.starts_at)}</time>
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-0.5 text-caption font-medium capitalize',
                    STATUS_STYLE[row.status] ?? 'bg-muted text-muted-foreground',
                  )}
                >
                  {row.status.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Building2 className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">Hosted by {row.host}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {row.city}
                </span>
              </div>

              {actions.length ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {actions.map(({ href, label, icon: Icon }) => (
                    <Link key={label} href={href} className={actionClass}>
                      <Icon className="size-3.5" aria-hidden /> {label}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="border-t border-border pt-3 text-caption text-muted-foreground">
                  View only — the host has not enabled any actions for you yet.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
