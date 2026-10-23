'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ExternalLink } from 'lucide-react';
import {
  fetchAdminSections,
  reorderSections,
  updateSection,
  type AdminSection,
  type SectionSettingSchema,
} from '@/lib/api/cms';
import { errorMessage } from '@/lib/api/errors';
import { ErrorState, Panel, Skeleton } from '@/components/organizer/primitives';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';

/**
 * HOMEPAGE SECTIONS — show, hide, order and tune every block of the front page.
 *
 * Hiding a section removes it from the page entirely (no timers, no requests,
 * no empty gap); its content is kept, so switching it back on restores it.
 * Every control writes immediately and says so — there is no Save button to
 * forget — and a failure puts the control back where the server says it is.
 */

const KEY = ['admin', 'homepage-sections'] as const;

/** Tell the public site its cached page is stale. Best effort: the 30s window
 *  still applies if this fails, so a failure is not worth an error toast. */
const purgePublicPage = () =>
  fetch('/api/revalidate-homepage', { method: 'POST' }).catch(() => undefined);

export function SectionsAdmin() {
  const client = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({ queryKey: KEY, queryFn: fetchAdminSections });
  const rows = query.data?.data ?? [];

  const saved = () => {
    toast({ title: 'Saved', variant: 'success' });
    void purgePublicPage();
    void client.invalidateQueries({ queryKey: KEY });
  };
  const failed = (error: unknown) => {
    toast({ title: errorMessage(error), variant: 'destructive' });
    void client.invalidateQueries({ queryKey: KEY });
  };

  const update = useMutation({
    mutationFn: (v: {
      key: string;
      visible?: boolean;
      settings?: Record<string, boolean | number>;
    }) => updateSection(v.key, { visible: v.visible, settings: v.settings }),
    onSuccess: saved,
    onError: failed,
  });
  const reorder = useMutation({
    mutationFn: (order: string[]) => reorderSections(order),
    onSuccess: saved,
    onError: failed,
  });

  const move = (index: number, by: -1 | 1) => {
    const order = rows.map((r) => r.key);
    const target = index + by;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    reorder.mutate(order);
  };

  if (query.isError)
    return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  if (query.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Switch a block off to remove it from the front page. Its content is kept.
        </p>
        <Link
          href="/"
          target="_blank"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View homepage <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </div>
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.key}>
            <SectionRow
              row={row}
              first={index === 0}
              last={index === rows.length - 1}
              busy={update.isPending || reorder.isPending}
              onMove={(by) => move(index, by)}
              onToggle={(visible) => update.mutate({ key: row.key, visible })}
              onSetting={(key, value) =>
                update.mutate({ key: row.key, settings: { [key]: value } })
              }
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function SectionRow({
  row,
  first,
  last,
  busy,
  onMove,
  onToggle,
  onSetting,
}: {
  row: AdminSection;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (by: -1 | 1) => void;
  onToggle: (visible: boolean) => void;
  onSetting: (key: string, value: boolean | number) => void;
}) {
  return (
    <Panel className={cn('p-4', !row.visible && 'opacity-80')}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-medium text-foreground">{row.label}</p>
          <p className="text-sm text-muted-foreground">{row.description}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Move ${row.label} up`}
            disabled={first || busy}
            onClick={() => onMove(-1)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Move ${row.label} down`}
            disabled={last || busy}
            onClick={() => onMove(1)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <ArrowDown className="size-4" aria-hidden />
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={row.visible}
            disabled={busy}
            aria-label={`Show ${row.label} on the homepage`}
            onCheckedChange={onToggle}
          />
          <span className="w-12 text-muted-foreground">{row.visible ? 'Shown' : 'Hidden'}</span>
        </label>
      </div>
      {row.settings_schema.length > 0 && (
        <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          {row.settings_schema.map((spec) => (
            <SettingControl
              key={spec.key}
              spec={spec}
              value={row.settings[spec.key] ?? spec.default}
              disabled={busy}
              onChange={(v) => onSetting(spec.key, v)}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function SettingControl({
  spec,
  value,
  disabled,
  onChange,
}: {
  spec: SectionSettingSchema;
  value: boolean | number;
  disabled: boolean;
  onChange: (v: boolean | number) => void;
}) {
  const id = React.useId();
  if (spec.kind === 'bool') {
    return (
      <div className="flex items-start gap-3">
        <Switch
          id={id}
          checked={value === true}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-describedby={`${id}-help`}
        />
        <div>
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {spec.label}
          </label>
          <p id={`${id}-help`} className="text-xs text-muted-foreground">
            {spec.help}
          </p>
        </div>
      </div>
    );
  }
  return (
    <NumberSetting
      id={id}
      spec={spec}
      value={Number(value)}
      disabled={disabled}
      onCommit={onChange}
    />
  );
}

/** Commits on blur/Enter, not per keystroke: half-typed "1" of "15" is not a value to save. */
function NumberSetting({
  id,
  spec,
  value,
  disabled,
  onCommit,
}: {
  id: string;
  spec: SectionSettingSchema;
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (!Number.isInteger(n) || n === value) return setDraft(String(value));
    const clamped = Math.min(spec.max ?? n, Math.max(spec.min ?? n, n));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {spec.label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={spec.min ?? undefined}
        max={spec.max ?? undefined}
        value={draft}
        disabled={disabled}
        aria-describedby={`${id}-help`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="mt-1 block w-28 rounded-md border border-input bg-surface px-3 py-2 text-sm"
      />
      <p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">
        {spec.help}
      </p>
    </div>
  );
}
