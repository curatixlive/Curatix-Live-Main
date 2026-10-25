'use client';

import * as React from 'react';
import Link from 'next/link';
import { FilePenLine } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-provider';
import { draftStorageKey } from '@/lib/organizer/wizard/model';

/**
 * "Continue your unfinished event".
 *
 * The create form saves every keystroke on this device, but the server cannot
 * hold an event until it has a title, venue, city and a future start time. So
 * somebody who leaves halfway has a real draft that no list shows, and no way
 * back to it except guessing the URL. This card is that way back.
 *
 * It appears only for a draft that is NOT on the server yet (once it is, it is
 * a row in the Events table already), and only when something was actually
 * typed.
 */
export function UnfinishedDraft() {
  const { user } = useAuth();
  const [title, setTitle] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    try {
      const raw = window.localStorage.getItem(draftStorageKey(user.id));
      if (!raw) return;
      const stored = JSON.parse(raw) as Record<string, unknown>;
      if (stored.eventId) return;
      const named = typeof stored.title === 'string' ? stored.title.trim() : '';
      const typed = ['venue', 'city', 'description', 'startsAt'].some(
        (key) => typeof stored[key] === 'string' && (stored[key] as string).trim() !== '',
      );
      if (named || typed) setTitle(named || 'Untitled event');
    } catch {
      // Blocked or corrupt storage: nothing to offer.
    }
  }, [user]);

  if (!title) return null;
  return (
    <section
      aria-label="Unfinished event"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-card shadow-sm"
    >
      <span className="flex min-w-0 items-center gap-3">
        <FilePenLine className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-body-sm font-semibold">{title}</span>
          <span className="block text-caption text-muted-foreground">
            You left this event half-finished. It is saved on this device.
          </span>
        </span>
      </span>
      <Link
        href="/dashboard/events/new"
        className="inline-flex h-control items-center rounded-full bg-cta px-pill text-label text-cta-foreground hover:bg-cta-hover"
      >
        Continue
      </Link>
    </section>
  );
}
