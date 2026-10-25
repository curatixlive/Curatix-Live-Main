'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellRing, Mail, Phone } from 'lucide-react';
import { errorMessage } from '@/lib/api/errors';
import {
  fetchEventWaitlist,
  fetchFailedPayments,
  sendPaymentReminders,
} from '@/lib/api/follow-ups';
import { formatEventDateTime } from '@/lib/discovery/format';
import { Button } from '@/components/ui/button';
import { Panel, Skeleton } from '@/components/organizer/primitives';

const inr = (minor: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(minor / 100);

/**
 * Two lists an organiser acts on for one event: people waiting for tickets to
 * come back, and buyers whose payment never went through. Both carry the
 * person's contact details, because the organiser may want to call; the
 * reminder button emails the buyer on the organiser's behalf (WhatsApp is a
 * later channel and is not offered here).
 */
export function EventFollowUps({ eventId }: { eventId: string }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Link
        href="/dashboard/events"
        className="inline-flex w-fit items-center gap-2 rounded-full text-label text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden /> All events
      </Link>
      <Waitlist eventId={eventId} />
      <UnpaidCheckouts eventId={eventId} />
    </div>
  );
}

function Waitlist({ eventId }: { eventId: string }) {
  const list = useQuery({
    queryKey: ['organizer', 'waitlist', eventId],
    queryFn: () => fetchEventWaitlist(eventId),
  });
  return (
    <Panel
      title="Waiting list"
      subtitle={
        list.data
          ? `${list.data.meta.count} ${list.data.meta.count === 1 ? 'person' : 'people'} · ${list.data.meta.tickets_wanted} tickets wanted`
          : undefined
      }
    >
      <div className="p-card pt-stack">
        <p className="mb-2 text-caption text-muted-foreground">
          They are emailed automatically when tickets become available.
        </p>
        {list.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : list.isError ? (
          <p role="alert" className="text-body-sm text-muted-foreground">
            {errorMessage(list.error)}
          </p>
        ) : list.data.data.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            Nobody is waiting. When the event sells out, people can ask to be told if tickets
            return.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {list.data.data.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-body-sm font-semibold">
                    {row.name || row.email}
                  </span>
                  <ContactLine email={row.email} phone={row.phone} />
                </span>
                <span className="text-right text-caption text-muted-foreground">
                  <span className="block text-body-sm font-semibold text-foreground">
                    {row.quantity} {row.quantity === 1 ? 'ticket' : 'tickets'}
                  </span>
                  {row.notified_at
                    ? 'Told tickets are back'
                    : `Joined ${formatEventDateTime(row.joined_at)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function ContactLine({ email, phone }: { email: string; phone: string }) {
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
      <a href={`mailto:${email}`} className="inline-flex items-center gap-1 hover:underline">
        <Mail className="size-3.5" aria-hidden /> {email}
      </a>
      {phone ? (
        <a href={`tel:${phone}`} className="inline-flex items-center gap-1 hover:underline">
          <Phone className="size-3.5" aria-hidden /> {phone}
        </a>
      ) : null}
    </span>
  );
}

function UnpaidCheckouts({ eventId }: { eventId: string }) {
  const client = useQueryClient();
  const key = ['organizer', 'payment-failures', eventId];
  const [note, setNote] = React.useState('');
  const list = useQuery({ queryKey: key, queryFn: () => fetchFailedPayments(eventId) });
  const remind = useMutation({
    mutationFn: (ids?: string[]) => sendPaymentReminders(eventId, ids),
    onSuccess: (result) => {
      setNote(
        result.sent
          ? `Reminder emailed to ${result.sent} ${result.sent === 1 ? 'person' : 'people'}.` +
              (result.skipped ? ` ${result.skipped} already reminded today.` : '')
          : 'Everyone here was already reminded today.',
      );
      void client.invalidateQueries({ queryKey: key });
    },
    onError: (error) => setNote(errorMessage(error)),
  });
  const rows = list.data?.data ?? [];

  return (
    <Panel
      title="Unpaid checkouts"
      subtitle="Payment did not complete"
      actions={
        rows.length > 1 ? (
          <Button size="sm" onClick={() => remind.mutate(undefined)} disabled={remind.isPending}>
            <BellRing className="size-4" aria-hidden /> Remind everyone
          </Button>
        ) : undefined
      }
    >
      <div className="p-card pt-stack">
        <p className="mb-2 text-caption text-muted-foreground">
          People who started booking but did not finish paying. No money was taken and no ticket was
          issued. A reminder can go to each person once a day.
        </p>
        {note ? (
          <p role="status" className="mb-3 text-body-sm text-muted-foreground">
            {note}
          </p>
        ) : null}
        {list.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : list.isError ? (
          <p role="alert" className="text-body-sm text-muted-foreground">
            {errorMessage(list.error)}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">No unfinished checkouts. Nice.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.booking_id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body-sm font-semibold">
                    {row.name || row.email}
                  </span>
                  <ContactLine email={row.email} phone={row.phone} />
                </span>
                <span className="flex items-center gap-4">
                  <span className="text-right text-caption text-muted-foreground">
                    <span className="block text-body-sm font-semibold text-foreground">
                      {row.tickets} {row.tickets === 1 ? 'ticket' : 'tickets'} ·{' '}
                      {inr(row.amount_minor)}
                    </span>
                    {formatEventDateTime(row.attempted_at)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={remind.isPending}
                    onClick={() => remind.mutate([row.booking_id])}
                    aria-label={`Send ${row.name || row.email} a reminder`}
                  >
                    Remind
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
