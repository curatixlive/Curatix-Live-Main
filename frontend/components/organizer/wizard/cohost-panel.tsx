'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Trash2, UserPlus, Users } from 'lucide-react';
import { Button, Input, Switch } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import {
  addCoHost,
  fetchCoHosts,
  removeCoHost,
  updateCoHost,
  type CoHostPermissions,
} from '@/lib/api/event-access-admin';

export const PERMISSION_LABELS: ReadonlyArray<[keyof CoHostPermissions, string, string]> = [
  ['analytics', 'Event analytics', 'Views, bookings, attendance and audience.'],
  ['attendees', 'Attendee list', 'Names, contact details and check-in status.'],
  ['checkin', 'Scan tickets', 'Admit people at the door.'],
  ['finance', 'Revenue, refunds and payouts', 'Off by default. Money figures stay hidden.'],
];

/**
 * Co-hosts for ONE event, with a permission set per person.
 *
 * A new co-host can do everything except see money. Each person's switches are
 * independent, and the host is the only one who can change them. A co-host has
 * to already have a Curatix account; they find the event under "Events you
 * co-host" on their own dashboard.
 */
export function CoHostPanel({ eventId }: { eventId: string | null }) {
  const client = useQueryClient();
  const key = ['organizer', 'cohosts', eventId];
  const [email, setEmail] = React.useState('');
  const [failure, setFailure] = React.useState('');
  // Addresses typed before the event exists. They are added the moment it does,
  // so access can be arranged while creating, not only afterwards.
  const [pending, setPending] = React.useState<string[]>([]);

  const list = useQuery({
    queryKey: key,
    queryFn: () => fetchCoHosts(eventId as string),
    enabled: Boolean(eventId),
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });

  React.useEffect(() => {
    if (!eventId || pending.length === 0) return;
    const queued = pending;
    setPending([]);
    void Promise.allSettled(queued.map((address) => addCoHost(eventId, address))).then(
      (results) => {
        const failed = results.filter((result) => result.status === 'rejected').length;
        if (failed) {
          setFailure(
            `${failed} co-host${failed === 1 ? '' : 's'} could not be added. Each person needs a Curatix account first.`,
          );
        }
        void client.invalidateQueries({ queryKey: ['organizer', 'cohosts', eventId] });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const add = useMutation({
    mutationFn: () => addCoHost(eventId as string, email.trim()),
    onSuccess: () => {
      setEmail('');
      setFailure('');
      void refresh();
    },
    onError: (error) => setFailure(errorMessage(error)),
  });
  const change = useMutation({
    mutationFn: (input: { id: string; permissions: Partial<CoHostPermissions> }) =>
      updateCoHost(eventId as string, input.id, input.permissions),
    onSuccess: () => void refresh(),
    onError: (error) => setFailure(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeCoHost(eventId as string, id),
    onSuccess: () => void refresh(),
    onError: (error) => setFailure(errorMessage(error)),
  });

  return (
    <section
      aria-label="Co-hosts"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-card"
    >
      <div className="flex items-center gap-2">
        <Users className="size-5 text-primary" aria-hidden />
        <div>
          <h3 className="text-h4">Co-hosts</h3>
          <p className="text-caption text-muted-foreground">
            Let other people help run this event. Choose what each can see.
          </p>
        </div>
      </div>

      <p className="text-caption text-muted-foreground">
        People on your{' '}
        <Link href="/dashboard/team" className="underline underline-offset-4">
          whole-band team
        </Link>{' '}
        can already help with every event. Add someone here to give them just this one.
      </p>

      {!eventId ? (
        <>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(submit) => {
              submit.preventDefault();
              const next = email.trim().toLowerCase();
              if (next && !pending.includes(next)) setPending([...pending, next]);
              setEmail('');
            }}
          >
            <Input
              aria-label="Co-host email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="their-account@example.com"
              className="max-w-72"
            />
            <Button type="submit" variant="outline" disabled={!email.trim()}>
              <UserPlus className="size-4" aria-hidden /> Add co-host
            </Button>
          </form>
          {pending.length ? (
            <ul
              className="flex flex-col gap-1"
              aria-label="Co-hosts to add when the event is created"
            >
              {pending.map((address) => (
                <li key={address} className="flex items-center justify-between gap-2 text-body-sm">
                  <span className="truncate">{address}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${address}`}
                    onClick={() => setPending(pending.filter((value) => value !== address))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-caption text-muted-foreground">
            They are added with the usual access (everything except money) as soon as the event is
            created. You can change what each can see afterwards.
          </p>
        </>
      ) : (
        <>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(submit) => {
              submit.preventDefault();
              if (email.trim()) add.mutate();
            }}
          >
            <Input
              aria-label="Co-host email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="their-account@example.com"
              className="max-w-72"
            />
            <Button type="submit" variant="outline" disabled={!email.trim() || add.isPending}>
              <UserPlus className="size-4" aria-hidden />{' '}
              {add.isPending ? 'Adding…' : 'Add co-host'}
            </Button>
          </form>

          {failure ? (
            <p role="alert" className="text-body-sm text-muted-foreground">
              {failure}
            </p>
          ) : null}

          {list.isPending ? (
            <p className="text-caption text-muted-foreground">Loading…</p>
          ) : (list.data ?? []).length === 0 ? (
            <p className="text-caption text-muted-foreground">No co-hosts yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(list.data ?? []).map((host) => (
                <li
                  key={host.id}
                  className="flex flex-col gap-2 rounded-xl border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-body-sm font-semibold">
                        {host.name || host.email}
                      </span>
                      {host.name ? (
                        <span className="block truncate text-caption text-muted-foreground">
                          {host.email}
                        </span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${host.email}`}
                      onClick={() => remove.mutate(host.id)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {PERMISSION_LABELS.map(([permission, label, hint]) => (
                      <li key={permission} className="flex items-center justify-between gap-3">
                        <span>
                          <span className="block text-body-sm">{label}</span>
                          <span className="block text-caption text-muted-foreground">{hint}</span>
                        </span>
                        <Switch
                          aria-label={`${label} for ${host.email}`}
                          checked={Boolean(host.permissions[permission])}
                          onCheckedChange={(on: boolean) =>
                            change.mutate({ id: host.id, permissions: { [permission]: on } })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
