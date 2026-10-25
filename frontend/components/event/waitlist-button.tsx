'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Check, Loader2 } from 'lucide-react';
import { fetchMyWaitlist, joinWaitlist, leaveWaitlist } from '@/lib/api/waitlist';
import { errorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthSheet } from '@/components/auth/auth-sheet';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';

/**
 * "Tell me when tickets are available" — the sold-out event's one action.
 *
 * ── IT REPLACES A DEAD END ────────────────────────────────────────────────
 *
 * A sold-out event used to offer "See ticket types", which opens a picker of
 * disabled rows and a disabled Checkout. That is honest and it is still a dead
 * end: the visitor came to go to a thing, and the platform's last word was a
 * screen with nothing on it to press.
 *
 * ── ONE COMPONENT, THREE MOUNTS ───────────────────────────────────────────
 *
 * The desktop rail, the mobile sticky bar and the mobile deck's bar all render
 * THIS, for the reason `AuthPanel` is rendered by both `/sign-in` and the
 * funnel's sheet: two copies of a control is how the two drift, and this one
 * changes state after a write. Three mounts of one control is not asking
 * twice — it is one question in the three places somebody meets it.
 *
 * ── THE AFFORDANCE COMES BEFORE THE ACCOUNT, THE PROMISE DOES NOT ─────────
 *
 * The button is drawn for everybody, signed in or not, because a control that
 * demands an account before it will even appear removes it for exactly the
 * people still deciding whether to make one — the rule the saved-events heart
 * follows.
 *
 * But it CANNOT keep an anonymous join in `localStorage` the way a save does.
 * A save's only consumer is the same browser; a waitlist join is a promise to
 * write to somebody, and an anonymous visitor has no address. Pretending
 * otherwise would be the "appears to work and delivers nothing" failure this
 * codebase refuses everywhere else. So the press opens the sign-in sheet, and
 * the join completes on the far side — which is exactly what the checkout does
 * with Checkout.
 */
export function WaitlistButton({
  eventId,
  /** The path to return to after an OAuth round trip. */
  returnTo,
  variant = 'block',
  className,
}: {
  eventId: string;
  returnTo: string;
  /** `block` fills its container (the desktop rail); `inline` sits in a bar. */
  variant?: 'block' | 'inline';
  className?: string;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [authOpen, setAuthOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /**
   * The press that was interrupted by the sign-in sheet.
   *
   * Answering an interruption should not cost the action that raised it — the
   * same reason the funnel's Checkout press resumes on the far side of its
   * sheet rather than dropping the customer back on the tickets screen with
   * nothing having happened.
   */
  const pendingJoin = React.useRef(false);
  // The join form: how many tickets, and a number the organiser can reach.
  const [formOpen, setFormOpen] = React.useState(false);
  const [quantity, setQuantity] = React.useState(1);
  const [phone, setPhone] = React.useState('');
  const [formError, setFormError] = React.useState('');

  const state = useQuery({
    queryKey: ['my-waitlist'],
    queryFn: fetchMyWaitlist,
    // Only for somebody who has an account — there is nothing to ask about
    // otherwise, and an anonymous 401 on the platform's busiest public page is
    // a request that can only ever fail.
    enabled: Boolean(user),
    staleTime: 30_000,
  });
  const joined = Boolean(state.data?.event_ids.includes(eventId));

  const write = useMutation({
    mutationFn: (next: boolean) =>
      next ? joinWaitlist(eventId, { quantity, phone: phone.trim() }) : leaveWaitlist(eventId),
    // The response carries the WHOLE set, so the cache is replaced rather than
    // reconciled — one shape for join, leave and the account read, and no way
    // for a dropped request to leave the button lying about its state.
    onSuccess: (result) => {
      client.setQueryData(['my-waitlist'], (previous: typeof state.data) => ({
        data: previous?.data ?? [],
        event_ids: result.event_ids,
      }));
      // The list itself (dates, availability, whether we have written yet) is
      // only correct from the server, so it is refetched rather than patched.
      void client.invalidateQueries({ queryKey: ['my-waitlist'] });
      setError(null);
      setFormOpen(false);
    },
    onError: (thrown) => {
      setError(errorMessage(thrown));
      setFormError(errorMessage(thrown));
    },
  });

  const openForm = () => {
    setFormError('');
    setPhone((current) => current || user?.phone || '');
    setFormOpen(true);
  };

  const press = () => {
    setError(null);
    if (!user) {
      pendingJoin.current = true;
      setAuthOpen(true);
      return;
    }
    // Leaving is one press. Joining first asks how many tickets and for a
    // number, because the organiser sees both.
    if (joined) write.mutate(false);
    else openForm();
  };

  const busy = write.isPending || (Boolean(user) && state.isPending);

  return (
    <>
      <button
        type="button"
        onClick={press}
        disabled={write.isPending}
        aria-pressed={joined}
        className={cn(
          'inline-flex h-control items-center justify-center gap-2 rounded-full px-pill text-label transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-70',
          joined
            ? 'border border-border bg-success-subtle text-success-subtle-foreground'
            : 'bg-cta text-cta-foreground shadow-sm hover:bg-cta-hover active:bg-cta-active',
          variant === 'block' ? 'w-full' : 'shrink-0',
          className,
        )}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : joined ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <BellRing className="size-4" aria-hidden />
        )}
        {joined ? "You're on the list" : 'Tell me when tickets are free'}
      </button>

      {/* WHAT THE PROMISE ACTUALLY IS, stated before the press and again
          after it. Several people are told per returned ticket, because
          nothing is held for anybody — saying so here is the difference
          between a heads-up and a reservation somebody drives to a venue
          believing in. */}
      {variant === 'block' ? (
        <p className="text-caption text-muted-foreground">
          {joined
            ? 'We will email you once if tickets come back. They go first come, first served — nothing is held.'
            : 'We will email you once if tickets come back. Nothing is held for you.'}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-caption text-muted-foreground">
          {error}
        </p>
      ) : null}

      <Modal open={formOpen} onOpenChange={setFormOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Join the waiting list</ModalTitle>
            <ModalDescription>
              Tell us how many tickets you need and where the organiser can reach you. We will email
              you if tickets come back. Nothing is held for you.
            </ModalDescription>
          </ModalHeader>
          <form
            className="grid gap-4"
            onSubmit={(submit) => {
              submit.preventDefault();
              if (!phone.trim()) {
                setFormError('Enter a mobile number the organiser can reach you on.');
                return;
              }
              write.mutate(true);
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="waitlist-quantity">How many tickets?</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Fewer tickets"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                >
                  −
                </Button>
                <output
                  id="waitlist-quantity"
                  className="min-w-8 text-center text-body font-semibold"
                >
                  {quantity}
                </output>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="More tickets"
                  disabled={quantity >= 10}
                  onClick={() => setQuantity((value) => Math.min(10, value + 1))}
                >
                  +
                </Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="waitlist-phone">Mobile number</Label>
              <Input
                id="waitlist-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91 98765 43210"
              />
              <p className="text-caption text-muted-foreground">
                We will use the email on your account: {user?.email}
              </p>
            </div>
            {formError ? (
              <p role="alert" className="text-body-sm text-muted-foreground">
                {formError}
              </p>
            ) : null}
            <ModalFooter>
              <Button type="submit" disabled={write.isPending}>
                {write.isPending ? 'Joining…' : 'Join the waiting list'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <AuthSheet
        open={authOpen}
        onOpenChange={(next) => {
          setAuthOpen(next);
          // Dismissed without signing in. Drop the intent rather than letting
          // it fire on some later, unrelated sign-in.
          if (!next) pendingJoin.current = false;
        }}
        onAuthenticated={() => {
          setAuthOpen(false);
          if (pendingJoin.current) {
            pendingJoin.current = false;
            openForm();
          }
        }}
        next={returnTo}
        heading="Sign in to join the waiting list"
        subheading="We need somewhere to write to when tickets come back. It takes a moment."
      />
    </>
  );
}
