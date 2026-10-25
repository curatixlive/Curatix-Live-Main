'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, Plus } from 'lucide-react';
import {
  createPartnerPromotion,
  fetchPartnerPromotions,
  recordPartnerPayout,
  updatePartnerPromotion,
  type CommissionKind,
  type PartnerPromotion,
} from '@/lib/api/partner-promotions';
import { errorMessage } from '@/lib/api/errors';
import { formatMoney } from '@/lib/discovery/format';
import {
  describeCommission,
  partnerLinkUrl,
  toCommissionValue,
  validatePartnerDraft,
  type PartnerDraft,
} from '@/lib/organizer/partner-links';
import { useEventRows } from '@/lib/organizer/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, Skeleton, StatusPill } from '@/components/organizer/primitives';

/**
 * Partner links — a trackable link per influencer or promoter, and the
 * commission it has earned.
 *
 * Every number is read from the server, which derives it from CONFIRMED
 * bookings less refunds. Event-page visits are shown as "not measured" because
 * the platform counts a link's clicks and its bookings but not the page views
 * in between; an invented figure there would be the one number a partner
 * disputes.
 */
export function PartnerLinks({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = React.useState(false);
  const list = useQuery({
    queryKey: ['organizer', 'partner-promotions', organizationId],
    queryFn: () => fetchPartnerPromotions(organizationId),
    staleTime: 30_000,
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ['organizer', 'partner-promotions', organizationId],
    });

  const rows = list.data ?? [];
  return (
    <Panel
      title="Partner links"
      subtitle="A trackable link for each influencer or promoter. Commission is counted only from paid bookings, less refunds."
      actions={
        <Button size="sm" className="gap-1.5" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" aria-hidden />
          New partner link
        </Button>
      }
    >
      <div className="flex flex-col gap-block">
        {adding ? (
          <NewLinkForm
            organizationId={organizationId}
            onDone={() => {
              setAdding(false);
              void refresh();
            }}
          />
        ) : null}
        {list.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : list.isError ? (
          <p role="alert" className="text-danger-subtle-foreground text-body-sm">
            Could not load partner links. {errorMessage(list.error)}
          </p>
        ) : rows.length === 0 && !adding ? (
          <p className="text-body-sm text-muted-foreground">
            No partner links yet. Create one, share the link, and its clicks, bookings and
            commission appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-stack">
            {rows.map((row) => (
              <PartnerRow
                key={row.id}
                row={row}
                organizationId={organizationId}
                onChanged={() => void refresh()}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function NewLinkForm({ organizationId, onDone }: { organizationId: string; onDone: () => void }) {
  const [draft, setDraft] = React.useState<PartnerDraft>({
    name: '',
    partner: '',
    code: '',
    kind: 'percent',
    amount: '',
    windowDays: '7',
    eventId: '',
  });
  const [showIssues, setShowIssues] = React.useState(false);
  const events = useEventRows({});
  const eventOptions = React.useMemo(
    () => events.data?.pages.flatMap((p) => p.data) ?? [],
    [events.data],
  );
  const issues = validatePartnerDraft(draft);
  const set = <K extends keyof PartnerDraft>(key: K, value: PartnerDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const create = useMutation({
    mutationFn: () =>
      createPartnerPromotion(organizationId, {
        name: draft.name.trim(),
        partner_name: draft.partner.trim(),
        code: draft.code.trim(),
        event_id: draft.eventId || null,
        commission_kind: draft.kind,
        commission_value: toCommissionValue(draft.kind, draft.amount),
        attribution_window_days: Number(draft.windowDays),
      }),
    onSuccess: onDone,
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setShowIssues(true);
    if (Object.keys(issues).length === 0 && !create.isPending) create.mutate();
  };
  const err = (key: keyof typeof issues) => (showIssues ? issues[key] : undefined);

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-stack rounded-xl border border-border bg-surface p-card sm:grid-cols-2"
    >
      <Field id="pl-name" label="Promotion name" required error={err('name')}>
        <Input
          id="pl-name"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Ria's Instagram story"
        />
      </Field>
      <Field id="pl-partner" label="Influencer / partner (optional)">
        <Input
          id="pl-partner"
          value={draft.partner}
          onChange={(e) => set('partner', e.target.value)}
          placeholder="Ria Sharma"
        />
      </Field>
      <Field
        id="pl-code"
        label="Tracking code"
        required
        error={err('code')}
        hint="Goes in the link. Cannot be changed later, because links already shared would break."
      >
        <Input
          id="pl-code"
          value={draft.code}
          onChange={(e) => set('code', e.target.value.toUpperCase())}
          placeholder="RIA10"
        />
      </Field>
      <Field
        id="pl-event"
        label="Event"
        hint="Leave on “All events” for a link that covers everything you run."
      >
        <select
          id="pl-event"
          value={draft.eventId}
          onChange={(e) => set('eventId', e.target.value)}
          className="h-control w-full rounded-lg border border-border bg-background px-3 text-body-sm"
        >
          <option value="">All events</option>
          {eventOptions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </Field>
      <Field id="pl-kind" label="Commission">
        <select
          id="pl-kind"
          value={draft.kind}
          onChange={(e) => set('kind', e.target.value as CommissionKind)}
          className="h-control w-full rounded-lg border border-border bg-background px-3 text-body-sm"
        >
          <option value="percent">Percentage of ticket revenue</option>
          <option value="fixed_per_ticket">Fixed amount per ticket</option>
        </select>
      </Field>
      <Field
        id="pl-amount"
        label={draft.kind === 'percent' ? 'Percent' : 'Rupees per ticket'}
        required
        error={err('amount')}
      >
        <Input
          id="pl-amount"
          inputMode="decimal"
          value={draft.amount}
          onChange={(e) => set('amount', e.target.value)}
          placeholder={draft.kind === 'percent' ? '10' : '30'}
        />
      </Field>
      <Field
        id="pl-window"
        label="Attribution window (days)"
        error={err('windowDays')}
        hint="A booking counts if it is made within this many days of the link being opened."
      >
        <Input
          id="pl-window"
          inputMode="numeric"
          value={draft.windowDays}
          onChange={(e) => set('windowDays', e.target.value)}
        />
      </Field>
      <div className="flex flex-col justify-end gap-2 sm:col-span-2">
        {create.isError ? (
          <p role="alert" className="text-danger-subtle-foreground text-body-sm">
            {errorMessage(create.error)}
          </p>
        ) : null}
        <div>
          <Button type="submit" loading={create.isPending}>
            Create link
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="text-danger-subtle-foreground ml-0.5">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-danger-subtle-foreground text-caption">
          {error}
        </p>
      ) : hint ? (
        <p className="text-caption text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function PartnerRow({
  row,
  organizationId,
  onChanged,
}: {
  row: PartnerPromotion;
  organizationId: string;
  onChanged: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState('');
  const stats = row.stats;
  const link = partnerLinkUrl(typeof window === 'undefined' ? '' : window.location.origin, row);

  const toggle = useMutation({
    mutationFn: () =>
      updatePartnerPromotion(organizationId, row.id, {
        status: row.status === 'active' ? 'paused' : 'active',
      }),
    onSuccess: onChanged,
  });
  const payout = useMutation({
    mutationFn: () =>
      recordPartnerPayout(organizationId, row.id, {
        amount_minor: Math.round(Number(amount) * 100),
        reference: reference.trim(),
      }),
    onSuccess: () => {
      setPaying(false);
      setAmount('');
      setReference('');
      onChanged();
    },
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is visible and selectable */
    }
  };

  const payable = stats?.commission_payable_minor ?? 0;
  const tone =
    row.status === 'active' ? 'success' : row.status === 'paused' ? 'warning' : 'neutral';

  return (
    <li className="flex flex-col gap-stack rounded-xl border border-border bg-surface p-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-body font-semibold">{row.name}</p>
          <p className="text-caption text-muted-foreground">
            {row.partner_name ? `${row.partner_name} · ` : ''}
            {describeCommission(row.commission_kind, row.commission_value, formatMoney)} ·{' '}
            {row.attribution_window_days}-day window
          </p>
        </div>
        <StatusPill tone={tone}>{row.status}</StatusPill>
      </div>

      <div className="flex min-w-0 items-center gap-2 rounded-lg bg-sunken px-3 py-2">
        <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <code className="min-w-0 flex-1 truncate text-caption">{link}</code>
        <Button variant="ghost" size="sm" onClick={copy} className="gap-1.5">
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {stats ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm sm:grid-cols-4">
          <Stat label="Clicks" value={`${stats.clicks} (${stats.unique_visitors} unique)`} />
          <Stat label="Checkouts started" value={stats.checkout_starts} />
          <Stat label="Paid bookings" value={stats.bookings} />
          <Stat label="Tickets" value={stats.tickets} />
          <Stat label="Revenue" value={formatMoney(stats.gross_minor)} />
          <Stat label="Refunded" value={formatMoney(stats.refunded_minor)} />
          <Stat label="Failed payments" value={stats.failed_payments} />
          <Stat label="Page visits" value="Not measured" />
          <Stat label="Commission earned" value={formatMoney(stats.commission_accrued_minor)} />
          <Stat label="Paid out" value={formatMoney(stats.commission_paid_minor)} />
          <Stat label="Owed now" value={formatMoney(payable)} strong />
        </dl>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          loading={toggle.isPending}
          onClick={() => toggle.mutate()}
        >
          {row.status === 'active' ? 'Pause' : 'Resume'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={payable <= 0}
          title={payable <= 0 ? 'Nothing is owed yet' : undefined}
          onClick={() => setPaying((v) => !v)}
        >
          Record a payout
        </Button>
      </div>

      {paying ? (
        <form
          className="grid gap-stack sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (Number(amount) > 0 && !payout.isPending) payout.mutate();
          }}
        >
          <Field id={`po-${row.id}`} label="Amount paid (₹)" hint={`Up to ${formatMoney(payable)}`}>
            <Input
              id={`po-${row.id}`}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field id={`pr-${row.id}`} label="Reference (optional)" hint="UPI or bank reference">
            <Input
              id={`pr-${row.id}`}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Button type="submit" loading={payout.isPending}>
            Save payout
          </Button>
          {payout.isError ? (
            <p role="alert" className="text-danger-subtle-foreground text-caption sm:col-span-3">
              {errorMessage(payout.error)}
            </p>
          ) : null}
          <p className="text-caption text-muted-foreground sm:col-span-3">
            This only records a payment you have already made. Nothing is sent from here.
          </p>
        </form>
      ) : null}
    </li>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{value}</dd>
    </div>
  );
}
