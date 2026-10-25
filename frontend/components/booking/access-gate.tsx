'use client';

import * as React from 'react';
import Link from 'next/link';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { needsAccessGate } from '@/lib/booking/access';
import { useBooking } from './booking-context';

const VIA_COPY: Record<string, string> = {
  code: 'Access code accepted',
  follower: 'Unlocked — you follow this organiser',
  attendee: 'Unlocked — you have been to one of their events',
};

/**
 * The access code, for an invite-only event or one with a pre-sale.
 *
 * The code is typed here and asked of the server; nothing about it is checked in
 * the browser. A person who follows the organiser or has attended before is
 * unlocked without typing anything, and the line says why — otherwise a screen
 * that suddenly shows more tickets looks like a glitch.
 */
export function AccessGate() {
  const { event, tiers, access, accessLoading, accessCode, setAccessCode } = useBooking();
  const [draft, setDraft] = React.useState(accessCode);
  const [tried, setTried] = React.useState(false);

  if (!needsAccessGate(Boolean(event.invite_only), tiers)) return null;

  if (access?.granted) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-border bg-success-subtle px-card py-3 text-body-sm text-success-subtle-foreground">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        {VIA_COPY[access.via] ?? 'Access unlocked'}
      </p>
    );
  }

  const inviteOnly = Boolean(event.invite_only);
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-card"
      onSubmit={(submit) => {
        submit.preventDefault();
        setTried(true);
        setAccessCode(draft);
      }}
    >
      <p className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
        <KeyRound className="size-4 shrink-0" aria-hidden />
        {inviteOnly ? 'This event is invite-only' : 'Have a pre-sale access code?'}
      </p>
      <p className="text-caption text-muted-foreground">
        {inviteOnly
          ? 'Enter the code you were sent. People who follow the organiser or have been to their events are let in automatically.'
          : 'Pre-sale tickets open early for people with a code, followers and past attendees.'}
      </p>
      <div className="flex gap-2">
        <Input
          aria-label="Access code"
          value={draft}
          onChange={(change) => setDraft(change.target.value.toUpperCase().slice(0, 32))}
          placeholder="ACCESS CODE"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono"
        />
        <Button type="submit" variant="outline" disabled={!draft.trim() || accessLoading}>
          {accessLoading ? 'Checking…' : 'Apply'}
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        No code?{' '}
        <Link href={`/organizers/${event.organization_id}`} className="font-medium underline">
          Follow {event.organization_name}
        </Link>{' '}
        — followers are let in automatically.
      </p>
      {tried && accessCode && !accessLoading ? (
        <p role="status" className="text-caption text-muted-foreground">
          That code didn’t unlock anything. Check it and try again.
        </p>
      ) : null}
    </form>
  );
}
