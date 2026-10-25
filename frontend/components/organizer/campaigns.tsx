'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, MapPin, Megaphone, MessageCircle, Send } from 'lucide-react';
import { errorMessage } from '@/lib/api/errors';
import {
  fetchCampaignHistory,
  fetchCampaignOverview,
  previewCampaign,
  sendCampaign,
  type CampaignSegment,
} from '@/lib/api/campaigns';
import { formatEventDateTime } from '@/lib/discovery/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Panel, Skeleton } from '@/components/organizer/primitives';
import { cn } from '@/lib/utils/cn';

const inr = (minor: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(minor / 100);

const SEGMENTS: { id: Exclude<CampaignSegment, 'event'>; label: string; hint: string }[] = [
  { id: 'all', label: 'Everyone who bought', hint: 'Every customer with a paid order' },
  { id: 'repeat', label: 'Regulars', hint: 'Two or more paid orders' },
  { id: 'recent', label: 'Recent buyers', hint: 'Paid in the last 90 days' },
];

/**
 * Campaigns: who your customers are, where your crowds come, and a way to write
 * to them. The audience is always worked out on the server from your own paid
 * bookings, so a campaign can never reach somebody who did not buy from you.
 */
export function Campaigns() {
  const overview = useQuery({
    queryKey: ['organizer', 'campaigns', 'overview'],
    queryFn: fetchCampaignOverview,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="inline-flex items-center gap-2 text-h3">
          <Megaphone className="size-6 text-primary" aria-hidden /> Campaigns
        </h1>
        <p className="text-body-sm text-muted-foreground">
          Reach the people who already come to your events.
        </p>
      </header>

      {overview.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : overview.isError ? (
        <Panel>
          <p role="alert" className="p-card text-body-sm text-muted-foreground">
            {errorMessage(overview.error)}
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {SEGMENTS.map((segment) => (
              <div
                key={segment.id}
                className="rounded-xl border border-border bg-surface p-card shadow-sm"
              >
                <p className="text-caption text-muted-foreground">{segment.label}</p>
                <p className="mt-1 text-h3 tabular-nums">{overview.data.audience[segment.id]}</p>
                <p className="text-caption text-muted-foreground">{segment.hint}</p>
              </div>
            ))}
          </div>

          <Composer audience={overview.data.audience} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Your best customers" subtitle="By what they have spent with you">
              {overview.data.top_customers.length === 0 ? (
                <p className="p-card text-body-sm text-muted-foreground">No paid orders yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {overview.data.top_customers.map((customer) => (
                    <li
                      key={customer.email}
                      className="flex items-center justify-between gap-3 px-card py-3"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-body-sm font-semibold">
                          {customer.name || customer.email}
                        </span>
                        <span className="block truncate text-caption text-muted-foreground">
                          {customer.email}
                          {customer.last_booked_at
                            ? ` · last ${formatEventDateTime(customer.last_booked_at)}`
                            : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-body-sm font-semibold tabular-nums">
                          {inr(customer.lifetime_value_minor)}
                        </span>
                        <span className="block text-caption text-muted-foreground">
                          {customer.orders} {customer.orders === 1 ? 'order' : 'orders'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Where your crowds come" subtitle="Tickets sold, by venue">
              {overview.data.venues.length === 0 ? (
                <p className="p-card text-body-sm text-muted-foreground">No paid orders yet.</p>
              ) : (
                <ul className="flex flex-col gap-3 p-card">
                  {overview.data.venues.map((venue) => {
                    const top = overview.data.venues[0]?.tickets || 1;
                    return (
                      <li key={`${venue.venue}-${venue.city}`} className="flex flex-col gap-1">
                        <span className="flex items-center justify-between gap-3 text-body-sm">
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="truncate">
                              {venue.venue}, {venue.city}
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {venue.tickets}
                          </span>
                        </span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(4, (venue.tickets / top) * 100)}%` }}
                          />
                        </span>
                        <span className="text-caption text-muted-foreground">
                          {venue.events} {venue.events === 1 ? 'event' : 'events'} · {venue.buyers}{' '}
                          {venue.buyers === 1 ? 'buyer' : 'buyers'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          <CampaignHistory />

          <Panel title="Payment reminders" subtitle="Nudge people whose payment did not complete">
            <p className="p-card text-body-sm text-muted-foreground">
              Open an event&rsquo;s{' '}
              <Link href="/dashboard/events" className="underline underline-offset-4">
                waiting list and unpaid checkouts
              </Link>{' '}
              page (from its attendee list) to remind people one at a time or all at once.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}

function Composer({ audience }: { audience: Record<'all' | 'repeat' | 'recent', number> }) {
  const [segment, setSegment] = React.useState<Exclude<CampaignSegment, 'event'>>('all');
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [result, setResult] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const recipients = audience[segment];
  const queryClient = useQueryClient();

  const send = useMutation({
    mutationFn: async () => {
      // Ask the server again right before sending: the cards above can be a
      // minute old, and the number confirmed is the number that will go.
      const preview = await previewCampaign(segment);
      if (
        !window.confirm(
          `Send "${subject.trim()}" to ${preview.recipients} ${preview.recipients === 1 ? 'person' : 'people'}?`,
        )
      ) {
        return null;
      }
      return sendCampaign({ segment, subject, message });
    },
    onSuccess: (outcome) => {
      if (!outcome) return;
      // The history is a read of what was just written; refetch rather than
      // splice a row in, so the list can never show something the server does not.
      void queryClient.invalidateQueries({ queryKey: ['organizer', 'campaigns', 'history'] });
      setResult({
        tone: 'ok',
        text: `Sent to ${outcome.sent} ${outcome.sent === 1 ? 'person' : 'people'}.${outcome.failed ? ` ${outcome.failed} could not be sent.` : ''}`,
      });
      setSubject('');
      setMessage('');
    },
    onError: (error) => setResult({ tone: 'error', text: errorMessage(error) }),
  });

  return (
    <Panel title="New email campaign" subtitle="Promote an event, an offer or a new series">
      <form
        className="flex flex-col gap-4 p-card"
        onSubmit={(submit) => {
          submit.preventDefault();
          setResult(null);
          send.mutate();
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label">Send to</legend>
          <div className="flex flex-wrap gap-2">
            {SEGMENTS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={segment === option.id}
                onClick={() => setSegment(option.id)}
                className={cn(
                  'inline-flex h-control items-center gap-2 rounded-full border px-pill text-label transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  segment === option.id
                    ? 'border-transparent bg-cta text-cta-foreground'
                    : 'border-border bg-surface text-foreground hover:bg-muted',
                )}
              >
                {option.label}
                <span className="tabular-nums opacity-80">{audience[option.id]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-subject">Subject</Label>
          <Input
            id="campaign-subject"
            value={subject}
            maxLength={120}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Early access to our winter series"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-message">Message</Label>
          <Textarea
            id="campaign-message"
            rows={6}
            value={message}
            maxLength={2000}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell them what is coming up and why they will love it."
          />
          <p className="text-caption text-muted-foreground">
            {message.length}/2000 · Each email says it came from you and why the person is getting
            it.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2 text-caption text-muted-foreground">
            <MessageCircle className="size-4" aria-hidden /> WhatsApp campaigns are coming soon.
          </p>
          <Button
            type="submit"
            disabled={!subject.trim() || !message.trim() || recipients === 0 || send.isPending}
          >
            <Send className="size-4" aria-hidden />
            {send.isPending ? 'Sending…' : `Send email to ${recipients}`}
          </Button>
        </div>

        {result ? (
          <p
            role={result.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'text-body-sm',
              result.tone === 'error' ? 'text-muted-foreground' : 'text-success',
            )}
          >
            {result.text}
          </p>
        ) : null}
      </form>
    </Panel>
  );
}

const SEGMENT_LABELS: Record<string, string> = {
  all: 'Everyone who bought',
  repeat: 'Regulars',
  recent: 'Recent buyers',
  event: 'One event',
};

/**
 * What has already gone out. Absent while empty or loading: "No campaigns yet"
 * above the composer would read as something missing rather than as a fact, and
 * a failed read is not worth a panel of its own — the composer still works.
 */
function CampaignHistory() {
  const history = useQuery({
    queryKey: ['organizer', 'campaigns', 'history'],
    queryFn: fetchCampaignHistory,
  });
  const rows = history.data ?? [];
  if (!rows.length) return null;

  return (
    <Panel title="Past campaigns" subtitle="Everything you have sent, newest first">
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 px-card py-3">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-body-sm font-semibold">
                <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{row.subject}</span>
              </span>
              <span className="text-caption text-muted-foreground">
                {formatEventDateTime(row.sent_at)}
              </span>
            </span>
            {row.message_preview ? (
              <span className="line-clamp-2 text-caption text-muted-foreground">
                {row.message_preview}
              </span>
            ) : null}
            <span className="text-caption text-muted-foreground">
              {SEGMENT_LABELS[row.segment] ?? 'Your customers'} · sent to {row.sent} of{' '}
              {row.recipients} {row.recipients === 1 ? 'person' : 'people'}
              {row.failed ? ` · ${row.failed} could not be sent` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
