'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, QrCode, Users } from 'lucide-react';
import { fetchCoHostedEvents } from '@/lib/api/event-access-admin';
import { formatEventDateTime } from '@/lib/discovery/format';

/**
 * Events somebody else has asked you to help run.
 *
 * Absent when there are none — most organisers co-host nothing, and an empty
 * "Events you co-host" card would read as something missing. Each link appears
 * only for what the host allowed: the pages would refuse the rest anyway, and a
 * link that leads to "not found" is worse than no link.
 */
export function CoHostedEvents() {
  const events = useQuery({
    queryKey: ['organizer', 'cohosted-events'],
    queryFn: fetchCoHostedEvents,
    staleTime: 60_000,
  });
  const rows = events.data ?? [];
  if (!rows.length) return null;

  return (
    <section
      aria-label="Events you co-host"
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-card"
    >
      <h2 className="text-h4">Events you co-host</h2>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.event_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block truncate text-body-sm font-semibold">{row.title}</span>
              <span className="block truncate text-caption text-muted-foreground">
                {row.host} · {row.city} · {formatEventDateTime(row.starts_at)}
              </span>
            </span>
            <span className="flex flex-wrap gap-3 text-caption">
              {row.permissions.analytics ? (
                <Link
                  href={`/dashboard/events/${row.event_id}/analytics`}
                  className="inline-flex items-center gap-1 underline underline-offset-4"
                >
                  <BarChart3 className="size-3.5" aria-hidden /> Analytics
                </Link>
              ) : null}
              {row.permissions.attendees ? (
                <Link
                  href={`/dashboard/events/${row.event_id}/attendees`}
                  className="inline-flex items-center gap-1 underline underline-offset-4"
                >
                  <Users className="size-3.5" aria-hidden /> Attendees
                </Link>
              ) : null}
              {row.permissions.checkin ? (
                <Link
                  href={`/dashboard/check-in?event=${row.event_id}`}
                  className="inline-flex items-center gap-1 underline underline-offset-4"
                >
                  <QrCode className="size-3.5" aria-hidden /> Scan tickets
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
