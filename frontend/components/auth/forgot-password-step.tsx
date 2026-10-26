'use client';

import * as React from 'react';
import { ArrowLeft, Eye, EyeOff, Info, KeyRound, Mail, MessageSquareText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  confirmPasswordReset,
  fetchResetChannels,
  requestPasswordReset,
  type ResetChannel,
} from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';

/**
 * Forgot password — one flow for admins, organisers and customers, because
 * they share one account and one sign-in.
 *
 * TWO STAGES in one card, replacing the sign-in form the way the email
 * verification step does: (1) address + how to receive the code, (2) the code
 * and the new password. It never signs anybody in; it hands back to the sign-in
 * form with a notice, so the new password is the thing that proves itself.
 *
 * ── WHAT IT DELIBERATELY SAYS ────────────────────────────────────────────
 * "If an account exists…" and nothing more. The server answers the same for
 * every address, and the screen must not undo that by being specific.
 *
 * ── CHANNELS ─────────────────────────────────────────────────────────────
 * Email, plus text message when this deployment can send one. WhatsApp is not
 * offered: no approved template or credential stands behind it, and a choice
 * that cannot deliver is the worst thing to put on a recovery screen. A text
 * message goes to the number on the account; if there is none the server falls
 * back to email, which the copy says.
 */

const CHANNEL_LABEL: Record<ResetChannel, { label: string; icon: LucideIcon }> = {
  email: { label: 'Email', icon: Mail },
  sms: { label: 'Text message', icon: MessageSquareText },
};

export function ForgotPasswordStep({
  initialEmail,
  onDone,
  onBack,
  className,
}: {
  initialEmail: string;
  /** Called after the password changed, so the panel can return to sign-in. */
  onDone: (email: string) => void;
  onBack: () => void;
  className?: string;
}) {
  const [stage, setStage] = React.useState<'ask' | 'reset'>('ask');
  const [email, setEmail] = React.useState(initialEmail);
  const [channels, setChannels] = React.useState<ResetChannel[]>(['email']);
  const [channel, setChannel] = React.useState<ResetChannel>('email');
  const [code, setCode] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [reveal, setReveal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    void fetchResetChannels().then((available) => {
      if (!cancelled) setChannels(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const report = (thrown: unknown) =>
    setError(
      isApiError(thrown)
        ? thrown.message
        : 'Something went wrong. Check your connection and try again.',
    );

  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!email.trim()) {
      setError('Enter the email address of your account.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestPasswordReset(email, channel);
      setStage('reset');
      setCode('');
      setCooldown(60);
      setNotice(
        channel === 'sms'
          ? 'If there is an account for that address, we have sent a code to the phone number on it — or to its email if it has none.'
          : 'If there is an account for that address, we have emailed it a 6-digit code.',
      );
    } catch (thrown) {
      report(thrown);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code.');
      return;
    }
    if (password.length < 8) {
      setError('Choose a password of at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordReset(email, code, password);
      onDone(email.trim().toLowerCase());
    } catch (thrown) {
      report(thrown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex w-full flex-col gap-stack-lg', className)}>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 rounded-full text-body-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to sign in
      </button>

      <header className="flex flex-col gap-1.5">
        <span
          className="inline-flex size-12 items-center justify-center rounded-full bg-nav-active text-nav-active-foreground"
          aria-hidden
        >
          <KeyRound className="size-5" />
        </span>
        <h1 className="mt-2 text-h4 sm:text-h3">Reset your password</h1>
        <p className="text-pretty text-body-sm text-muted-foreground">
          {stage === 'ask'
            ? 'We will send you a one-time code. It works for administrators, organisers and customers alike.'
            : 'Enter the code we sent and choose a new password.'}
        </p>
      </header>

      {stage === 'ask' ? (
        <form onSubmit={send} className="flex flex-col gap-stack" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>

          {channels.length > 1 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-label">Send the code by</legend>
              <div className="flex flex-wrap gap-2">
                {channels.map((value) => {
                  const { label, icon: Icon } = CHANNEL_LABEL[value];
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={channel === value}
                      onClick={() => setChannel(value)}
                      className={cn(
                        'inline-flex h-control items-center gap-2 rounded-full border px-pill text-label transition-colors duration-fast',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        channel === value
                          ? 'border-transparent bg-nav-active text-nav-active-foreground'
                          : 'border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <Feedback error={error} notice={notice} />

          <Button type="submit" size="lg" loading={busy} className="w-full">
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={reset} className="flex flex-col gap-stack" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="forgot-code">6-digit code</Label>
            <Input
              id="forgot-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="tabular-nums tracking-[0.4em]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="forgot-password">New password</Label>
            <div className="relative">
              <Input
                id="forgot-password"
                type={reveal ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setReveal((current) => !current)}
                aria-label={reveal ? 'Hide password' : 'Show password'}
                aria-pressed={reveal}
                className="absolute inset-y-0 right-0 inline-flex w-control items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {reveal ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
            </div>
            <p className="text-caption text-muted-foreground">At least 8 characters.</p>
          </div>

          <Feedback error={error} notice={notice} />

          <Button type="submit" size="lg" loading={busy} className="w-full">
            Change password
          </Button>

          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || cooldown > 0}
            className="mx-auto inline-flex min-h-control items-center rounded-full px-3 text-body-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
          </button>
        </form>
      )}
    </div>
  );
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-border bg-muted px-4 py-3 text-body-sm text-foreground"
      >
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p
        role="status"
        className="flex items-start gap-2.5 rounded-lg border border-border bg-sunken px-4 py-3 text-body-sm text-muted-foreground"
      >
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{notice}</span>
      </p>
    );
  }
  return null;
}
