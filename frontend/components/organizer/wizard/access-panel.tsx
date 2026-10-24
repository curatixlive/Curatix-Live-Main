'use client';

import * as React from 'react';
import { Copy, KeyRound, MessageCircle, Send } from 'lucide-react';
import { Button, Input, Switch } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { sendInvites, whatsappInviteUrl } from '@/lib/api/event-access-admin';
import { generateAccessCode } from '@/lib/booking/access';
import type { Draft } from '@/lib/organizer/wizard/model';
import type { DraftSave } from './fields';

/**
 * Who may buy early, and who may buy at all.
 *
 * One access code serves both: it opens an invite-only event, and it opens any
 * tier that has a pre-sale. Followers and people who have been to one of your
 * events are let in without a code. The code is only ever shown to YOU — the
 * public event page never carries it — and goes to other people only through the
 * invitations sent from here.
 *
 * Email goes through the platform's own mail. WhatsApp is a share link you send
 * yourself: there is no WhatsApp Business sender connected.
 */
export function AccessPanel({
  draft,
  update,
  save,
}: {
  draft: Draft;
  update: (changes: Partial<Draft>) => void;
  save: DraftSave;
}) {
  const [emails, setEmails] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const code = draft.accessCode.trim();
  const saved = save.state === 'saved' && Boolean(draft.eventId);
  const eventUrl =
    typeof window !== 'undefined' && draft.eventId
      ? `${window.location.origin}/events/${draft.eventId}`
      : '';

  const send = async () => {
    if (!draft.eventId) return;
    const list = emails
      .split(/[\s,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!list.length) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await sendInvites(draft.eventId, list);
      setMessage(
        `Sent to ${result.sent.length}${
          result.skipped.length ? `; skipped ${result.skipped.join(', ')}` : ''
        }.`,
      );
      if (!result.skipped.length) setEmails('');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Access and invitations"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-card"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" aria-hidden />
          <div>
            <h3 className="text-h4">Access &amp; invitations</h3>
            <p className="text-caption text-muted-foreground">
              Invite-only events, and the code that opens a pre-sale.
            </p>
          </div>
        </div>
        <Switch
          aria-label="Invite-only event"
          checked={draft.inviteOnly}
          onCheckedChange={(on: boolean) => {
            update({
              inviteOnly: on,
              accessCode: on && !code ? generateAccessCode() : draft.accessCode,
            });
          }}
        />
      </div>

      <p className="text-caption text-muted-foreground">
        {draft.inviteOnly
          ? 'Only people with the code, your followers and past attendees can book. The event is still listed.'
          : 'Off: anyone can book. Pre-sale tiers still use the code below.'}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="access-code" className="text-body-sm font-medium">
          Access code
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="access-code"
            value={draft.accessCode}
            onChange={(event) =>
              update({
                accessCode: event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9-]/g, '')
                  .slice(0, 32),
              })
            }
            placeholder="e.g. FRIENDS24"
            className="max-w-56 font-mono"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => update({ accessCode: generateAccessCode() })}
          >
            Generate
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!code}
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            <Copy className="size-4" aria-hidden /> {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">
          4–32 letters, numbers or dashes. Never shown on the public event page.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <label htmlFor="invite-emails" className="text-body-sm font-medium">
          Invite by email
        </label>
        {!draft.eventId ? (
          <p className="text-caption text-muted-foreground">
            Save the event first — the draft saves itself once the basics are filled in.
          </p>
        ) : !code ? (
          <p className="text-caption text-muted-foreground">
            Set an access code to send invitations.
          </p>
        ) : null}
        <textarea
          id="invite-emails"
          value={emails}
          onChange={(event) => setEmails(event.target.value)}
          rows={3}
          placeholder="name@example.com, another@example.com"
          disabled={!draft.eventId || !code}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-body-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => void send()}
            disabled={busy || !saved || !code || !emails.trim()}
          >
            <Send className="size-4" aria-hidden /> {busy ? 'Sending…' : 'Send invitations'}
          </Button>
          {code && eventUrl ? (
            <Button type="button" variant="outline" asChild>
              <a
                href={whatsappInviteUrl(draft.title || 'my event', eventUrl, code)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="size-4" aria-hidden /> Share on WhatsApp
              </a>
            </Button>
          ) : null}
        </div>
        {draft.eventId && code && !saved ? (
          <p className="text-caption text-muted-foreground">
            Waiting for the draft to save so the code is on the server…
          </p>
        ) : null}
        {message ? (
          <p role="status" className="text-caption text-muted-foreground">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
