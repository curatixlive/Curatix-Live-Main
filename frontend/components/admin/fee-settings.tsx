'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Percent, Trash2 } from 'lucide-react';
import { errorMessage } from '@/lib/api/errors';
import {
  clearFeeOverride,
  fetchFees,
  setDefaultFees,
  setFeeOverride,
  type FeeOverride,
} from '@/lib/api/fees';
import { buyerFeeFor, type FeeSchedule } from '@/lib/booking/selection';
import { formatMoney } from '@/lib/discovery/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EventPicker, type PickedEvent } from '@/components/admin/event-picker';
import { cn } from '@/lib/utils/cn';

/** What the admin types: percentages and rupees, converted to bps/paise on save. */
type FeeForm = { gateway: string; platform: string; minimum: string };

const toForm = (fees: FeeSchedule): FeeForm => ({
  gateway: String(fees.gateway_bps / 100),
  platform: String(fees.platform_bps / 100),
  minimum: String(fees.platform_min_minor / 100),
});

function fromForm(form: FeeForm): FeeSchedule | null {
  const gateway = Number(form.gateway);
  const platform = Number(form.platform);
  const minimum = Number(form.minimum);
  if (![gateway, platform, minimum].every((value) => Number.isFinite(value) && value >= 0)) {
    return null;
  }
  return {
    gateway_bps: Math.round(gateway * 100),
    platform_bps: Math.round(platform * 100),
    platform_min_minor: Math.round(minimum * 100),
  };
}

/**
 * The buyer's fee, set by a platform admin. The default applies everywhere;
 * an override for one event or organisation wins over it. A change applies to
 * bookings made after saving — including on events already approved and
 * selling — and never re-bills a booking that already exists. The organiser
 * always receives the full ticket price; this is added for the customer.
 */
export function FeeSettings() {
  const client = useQueryClient();
  const fees = useQuery({ queryKey: ['admin', 'fees'], queryFn: fetchFees });
  const refresh = () => client.invalidateQueries({ queryKey: ['admin', 'fees'] });

  return (
    <section
      aria-labelledby="fee-settings-title"
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-card shadow-sm"
    >
      <header className="flex items-start gap-3">
        <Percent className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 id="fee-settings-title" className="text-h4">
            Buyer fees
          </h2>
          <p className="text-body-sm text-muted-foreground">
            Added to what the customer pays, per ticket. Organisers always receive their full ticket
            price.
          </p>
        </div>
      </header>

      {fees.isPending ? (
        <p className="text-body-sm text-muted-foreground">Loading…</p>
      ) : fees.isError ? (
        <p role="alert" className="text-body-sm text-muted-foreground">
          {errorMessage(fees.error)}
        </p>
      ) : (
        <>
          <FeeEditor
            title="Platform default"
            initial={fees.data.default}
            onSave={(values) => setDefaultFees(values)}
            onSaved={refresh}
          />
          <Overrides overrides={fees.data.overrides} onChanged={refresh} />
          <AddOverride defaults={fees.data.default} onAdded={refresh} />
        </>
      )}
    </section>
  );
}

function FeeEditor({
  title,
  initial,
  onSave,
  onSaved,
  extra,
}: {
  title: string;
  initial: FeeSchedule;
  onSave: (values: FeeSchedule) => Promise<unknown>;
  onSaved: () => void;
  extra?: React.ReactNode;
}) {
  const [form, setForm] = React.useState<FeeForm>(() => toForm(initial));
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const parsed = fromForm(form);
  const save = useMutation({
    mutationFn: () => onSave(parsed as FeeSchedule),
    onSuccess: () => {
      setMessage({ ok: true, text: 'Saved. New bookings use this from now on.' });
      onSaved();
    },
    onError: (error) => setMessage({ ok: false, text: errorMessage(error) }),
  });
  const id = React.useId();

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border p-card"
      onSubmit={(submit) => {
        submit.preventDefault();
        setMessage(null);
        if (parsed) save.mutate();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-body font-semibold">{title}</h3>
        {extra}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(
          [
            ['gateway', 'Gateway fee (%)'],
            ['platform', 'Platform fee (%)'],
            ['minimum', 'Platform minimum (₹)'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-${key}`}>{label}</Label>
            <Input
              id={`${id}-${key}`}
              inputMode="decimal"
              value={form[key]}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-caption text-muted-foreground">
          {parsed
            ? `On a ${formatMoney(50_000)} ticket the buyer pays ${formatMoney(
                buyerFeeFor([{ unitPrice: 50_000, quantity: 1 }], parsed),
              )} extra.`
            : 'Enter numbers of zero or more.'}
        </p>
        <Button type="submit" size="sm" disabled={!parsed || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={cn('text-body-sm', message.ok ? 'text-success' : 'text-muted-foreground')}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

function Overrides({ overrides, onChanged }: { overrides: FeeOverride[]; onChanged: () => void }) {
  const remove = useMutation({
    mutationFn: (row: FeeOverride) => clearFeeOverride(row.scope, row.id),
    onSuccess: onChanged,
  });
  if (overrides.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">
        No overrides. Every event uses the platform default.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-body font-semibold">Overrides</h3>
      {overrides.map((row) => (
        <FeeEditor
          key={`${row.scope}-${row.id}`}
          title={`${row.scope === 'event' ? 'Event' : 'Organiser'}: ${row.name}`}
          initial={row}
          onSave={(values) => setFeeOverride(row.scope, row.id, values)}
          onSaved={onChanged}
          extra={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove the override for ${row.name}`}
              onClick={() => remove.mutate(row)}
            >
              <Trash2 className="size-4" aria-hidden /> Use default
            </Button>
          }
        />
      ))}
      <p className="text-caption text-muted-foreground">
        An event override wins over its organiser&rsquo;s, which wins over the default.
      </p>
    </div>
  );
}

function AddOverride({ defaults, onAdded }: { defaults: FeeSchedule; onAdded: () => void }) {
  const [event, setEvent] = React.useState<PickedEvent | null>(null);
  const [orgId, setOrgId] = React.useState('');
  const target = event
    ? { scope: 'event' as const, id: event.id, name: event.title }
    : orgId.trim()
      ? { scope: 'organization' as const, id: orgId.trim(), name: 'organisation' }
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-card">
      <h3 className="text-body font-semibold">Add an override</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-label">For one event</span>
          <EventPicker
            value={event}
            onChange={(next) => {
              setEvent(next);
              if (next) setOrgId('');
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fee-org-id">Or for one organiser (organisation id)</Label>
          <Input
            id="fee-org-id"
            value={orgId}
            placeholder="Paste the organisation id"
            onChange={(change) => {
              setOrgId(change.target.value);
              if (change.target.value) setEvent(null);
            }}
          />
        </div>
      </div>
      {target ? (
        <FeeEditor
          key={`${target.scope}-${target.id}`}
          title={target.scope === 'event' ? `Event: ${target.name}` : 'Organiser override'}
          initial={defaults}
          onSave={(values) => setFeeOverride(target.scope, target.id, values)}
          onSaved={() => {
            setEvent(null);
            setOrgId('');
            onAdded();
          }}
        />
      ) : null}
    </div>
  );
}
