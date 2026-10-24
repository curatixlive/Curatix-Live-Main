'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Armchair, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Switch } from '@/components/ui';
import { fetchOwnerEventTiers } from '@/lib/api/organizer';
import { ApiError, errorMessage } from '@/lib/api/errors';
import {
  createVenueLayout,
  disableEventSeating,
  enableEventSeating,
  fetchSeatMap,
  fetchVenueLayouts,
  type LayoutSection,
  type VenueLayout,
} from '@/lib/api/seating';
import { formatMoney } from '@/lib/discovery/format';
import { tiersToDraft, type DraftTier } from '@/lib/organizer/wizard/model';
import { cn } from '@/lib/utils/cn';

/**
 * Seating arrangement, inside the Tickets step.
 *
 * Off by default: an event with the switch off behaves exactly as before. On,
 * the organiser picks a layout (a previous one for this venue, or draws a new
 * one — which then becomes available to every organiser at that venue), prices
 * each section, and applies it. Each section becomes its own ticket type on the
 * server, so the ticket list below the switch is replaced by those sections.
 *
 * It needs a saved event: seats belong to an event id. Until the details are
 * saved the switch explains that instead of failing.
 */

const MAX_GRID_ROWS = 40;
const MAX_GRID_COLS = 60;
const MAX_SECTIONS = 12;
const TINTS = [
  'bg-primary/70',
  'bg-success/70',
  'bg-warning/70',
  'bg-info/70',
  'bg-destructive/60',
  'bg-accent-foreground/50',
];

export function SeatingPanel({
  eventId,
  venue,
  city,
  placeId,
  onTiers,
  onSeated,
}: {
  eventId: string | null;
  venue: string;
  city: string;
  placeId: string;
  /** The ticket types the server now holds for this event, as draft tiers. */
  onTiers: (tiers: DraftTier[]) => void;
  /** Whether the event currently sells assigned seats. */
  onSeated: (seated: boolean) => void;
}) {
  const client = useQueryClient();
  const [wantSeating, setWantSeating] = React.useState(false);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const current = useQuery({
    queryKey: ['organizer', 'seat-map', eventId],
    queryFn: async () => {
      try {
        return await fetchSeatMap(eventId as string);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: Boolean(eventId),
    staleTime: 0,
  });

  const syncTiers = async () => {
    if (!eventId) return;
    onTiers(tiersToDraft(await fetchOwnerEventTiers(eventId)));
    await client.invalidateQueries({ queryKey: ['organizer', 'seat-map', eventId] });
  };

  const seated = Boolean(current.data);
  React.useEffect(() => {
    if (!current.isPending) onSeated(seated);
  }, [seated, current.isPending, onSeated]);

  const remove = async () => {
    if (!eventId) return;
    setBusy(true);
    setError('');
    try {
      await disableEventSeating(eventId);
      await syncTiers();
      setWantSeating(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Armchair className="size-5 text-primary" aria-hidden />
          <div>
            <h3 className="text-h4">Seating arrangement</h3>
            <p className="text-caption text-muted-foreground">
              Let buyers choose their own seats from a map.
            </p>
          </div>
        </div>
        <Switch
          aria-label="Enable seating arrangement"
          checked={seated || wantSeating}
          disabled={busy || !eventId}
          onCheckedChange={(on: boolean) => {
            if (seated && !on) void remove();
            else setWantSeating(on);
          }}
        />
      </div>

      {!eventId ? (
        <p className="text-body-sm text-muted-foreground">
          Seats belong to a saved event. Fill in the basics, venue and date first — the draft saves
          itself — then come back here.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}

      {seated && current.data ? (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-wrap gap-2">
            {current.data.sections.map((section, i) => (
              <li
                key={section.id}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-caption"
              >
                <span className={cn('size-3 rounded-full', TINTS[i % TINTS.length])} aria-hidden />
                <span className="font-bold">{section.name}</span> ·{' '}
                {formatMoney(section.price_minor)} · {section.available}/{section.total} free
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted-foreground">
            Seating cannot be removed once a seat has been held or sold.
          </p>
        </div>
      ) : null}

      {!seated && wantSeating && eventId ? (
        <Chooser
          eventId={eventId}
          venue={venue}
          city={city}
          placeId={placeId}
          onDone={async () => {
            await syncTiers();
            setWantSeating(false);
          }}
        />
      ) : null}
    </section>
  );
}

function Chooser({
  eventId,
  venue,
  city,
  placeId,
  onDone,
}: {
  eventId: string;
  venue: string;
  city: string;
  placeId: string;
  onDone: () => Promise<void>;
}) {
  const layouts = useQuery({
    queryKey: ['seating', 'layouts', venue, city, placeId],
    queryFn: () => fetchVenueLayouts(venue, city, placeId),
    enabled: Boolean(venue && city),
  });
  const [picked, setPicked] = React.useState<VenueLayout | null>(null);
  const [drawing, setDrawing] = React.useState(false);

  if (!venue.trim() || !city.trim()) {
    return <p className="text-body-sm text-muted-foreground">Set the venue and city first.</p>;
  }

  if (picked) {
    return (
      <Pricing eventId={eventId} layout={picked} onBack={() => setPicked(null)} onDone={onDone} />
    );
  }

  if (drawing) {
    return (
      <Designer
        venue={venue}
        city={city}
        placeId={placeId}
        onCancel={() => setDrawing(false)}
        onSaved={(layout) => {
          setDrawing(false);
          setPicked(layout);
        }}
      />
    );
  }

  const list = layouts.data ?? [];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-muted-foreground">
        {layouts.isPending
          ? 'Looking for layouts at this venue…'
          : list.length
            ? `Layouts already saved for ${venue}:`
            : `No saved layout for ${venue} yet.`}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {list.map((layout) => (
          <li key={layout.id}>
            <button
              type="button"
              onClick={() => setPicked(layout)}
              className="flex w-full flex-col gap-2 rounded-xl border border-border p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MiniGrid layout={layout} />
              <span className="text-body-sm font-bold">{layout.name}</span>
              <span className="text-caption text-muted-foreground">
                {layout.seat_count} seats · {layout.sections.length} section
                {layout.sections.length === 1 ? '' : 's'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div>
        <Button type="button" variant="outline" onClick={() => setDrawing(true)}>
          <Plus className="size-4" aria-hidden /> Design a new layout
        </Button>
      </div>
    </div>
  );
}

function MiniGrid({ layout }: { layout: Pick<VenueLayout, 'grid' | 'sections' | 'cols'> }) {
  const index = new Map(layout.sections.map((s, i) => [s.id, i]));
  return (
    <div
      aria-hidden
      className="grid gap-px"
      style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}
    >
      {layout.grid.flatMap((row, r) =>
        row.map((cell, c) => (
          <span
            key={`${r}:${c}`}
            className={cn(
              'aspect-square rounded-sm',
              cell === null ? 'bg-transparent' : TINTS[(index.get(cell) ?? 0) % TINTS.length],
            )}
          />
        )),
      )}
    </div>
  );
}

function Pricing({
  eventId,
  layout,
  onBack,
  onDone,
}: {
  eventId: string;
  layout: VenueLayout;
  onBack: () => void;
  onDone: () => Promise<void>;
}) {
  const [prices, setPrices] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const ready = layout.sections.every((s) => {
    const n = Number(prices[s.id]);
    return prices[s.id] !== undefined && prices[s.id] !== '' && Number.isFinite(n) && n >= 0;
  });

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      await enableEventSeating(
        eventId,
        layout.id,
        layout.sections.map((s) => ({
          section_id: s.id,
          price_minor: Math.round(Number(prices[s.id]) * 100),
        })),
      );
      await onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <MiniGrid layout={layout} />
      <p className="text-body-sm">
        <span className="font-bold">{layout.name}</span> · {layout.seat_count} seats. Set a price
        for each section (₹):
      </p>
      <ul className="flex flex-col gap-2">
        {layout.sections.map((section, i) => (
          <li key={section.id} className="flex items-center gap-3">
            <span className={cn('size-3 rounded-full', TINTS[i % TINTS.length])} aria-hidden />
            <label htmlFor={`price-${section.id}`} className="min-w-24 flex-1 text-body-sm">
              {section.name}
            </label>
            <Input
              id={`price-${section.id}`}
              inputMode="decimal"
              className="w-28"
              placeholder="0"
              value={prices[section.id] ?? ''}
              onChange={(e) => setPrices((p) => ({ ...p, [section.id]: e.target.value }))}
            />
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="button" onClick={() => void apply()} disabled={!ready || busy}>
          {busy ? 'Applying…' : 'Apply seating'}
        </Button>
      </div>
    </div>
  );
}

function Designer({
  venue,
  city,
  placeId,
  onCancel,
  onSaved,
}: {
  venue: string;
  city: string;
  placeId: string;
  onCancel: () => void;
  onSaved: (layout: VenueLayout) => void;
}) {
  const [name, setName] = React.useState('');
  const [rows, setRows] = React.useState(8);
  const [cols, setCols] = React.useState(12);
  const [sections, setSections] = React.useState<LayoutSection[]>([{ id: 's1', name: 'General' }]);
  const [brush, setBrush] = React.useState<string | null>('s1');
  const [grid, setGrid] = React.useState<(string | null)[][]>(() => blank(8, 12, 's1'));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const resize = (r: number, c: number) => {
    const nr = Math.min(Math.max(r, 1), MAX_GRID_ROWS);
    const nc = Math.min(Math.max(c, 1), MAX_GRID_COLS);
    setRows(nr);
    setCols(nc);
    setGrid((old) =>
      Array.from({ length: nr }, (_, i) =>
        Array.from({ length: nc }, (_, j) =>
          old[i] ? (old[i]![j] ?? sections[0]!.id) : sections[0]!.id,
        ),
      ),
    );
  };

  const paint = (r: number, c: number) =>
    setGrid((old) =>
      old.map((row, i) => (i === r ? row.map((v, j) => (j === c ? brush : v)) : row)),
    );

  const used = new Set(grid.flat());
  const valid =
    name.trim().length > 0 &&
    sections.every((s) => s.name.trim() && used.has(s.id)) &&
    grid.flat().some((v) => v !== null);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const layout = await createVenueLayout({
        venue,
        city,
        place_id: placeId,
        name: name.trim(),
        rows,
        cols,
        sections: sections.map((s) => ({ id: s.id, name: s.name.trim() })),
        grid,
      });
      onSaved(layout);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sectionIndex = new Map(sections.map((s, i) => [s.id, i]));

  return (
    <div className="flex flex-col gap-3">
      <Input
        aria-label="Layout name"
        placeholder="Layout name, e.g. Main hall"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3 text-body-sm">
        <label className="flex items-center gap-2">
          Rows
          <Input
            type="number"
            className="w-20"
            min={1}
            max={MAX_GRID_ROWS}
            value={rows}
            onChange={(e) => resize(Number(e.target.value) || 1, cols)}
          />
        </label>
        <label className="flex items-center gap-2">
          Columns
          <Input
            type="number"
            className="w-20"
            min={1}
            max={MAX_GRID_COLS}
            value={cols}
            onChange={(e) => resize(rows, Number(e.target.value) || 1)}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-caption font-bold uppercase tracking-wide text-muted-foreground">
          Sections — pick one, then tap seats to paint
        </p>
        <ul className="flex flex-wrap gap-2">
          {sections.map((section, i) => (
            <li key={section.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={brush === section.id}
                aria-label={`Paint with ${section.name || 'section'}`}
                onClick={() => setBrush(section.id)}
                className={cn(
                  'size-6 rounded-full border-2',
                  TINTS[i % TINTS.length],
                  brush === section.id ? 'border-foreground' : 'border-transparent',
                )}
              />
              <Input
                aria-label={`Section ${i + 1} name`}
                className="w-28"
                value={section.name}
                onChange={(e) =>
                  setSections((all) =>
                    all.map((s) => (s.id === section.id ? { ...s, name: e.target.value } : s)),
                  )
                }
              />
              {sections.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove ${section.name || 'section'}`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSections((all) => all.filter((s) => s.id !== section.id));
                    setGrid((g) => g.map((row) => row.map((v) => (v === section.id ? null : v))));
                    if (brush === section.id) setBrush(null);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
          {sections.length < MAX_SECTIONS ? (
            <li>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const id = `s${Date.now().toString(36)}`;
                  setSections((all) => [...all, { id, name: `Section ${all.length + 1}` }]);
                  setBrush(id);
                }}
              >
                <Plus className="size-4" aria-hidden /> Section
              </Button>
            </li>
          ) : null}
          <li>
            <Button
              type="button"
              size="sm"
              variant={brush === null ? 'primary' : 'outline'}
              onClick={() => setBrush(null)}
            >
              Aisle / gap
            </Button>
          </li>
        </ul>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border p-2">
        <div
          role="group"
          aria-label="Layout grid"
          className="mx-auto grid w-max gap-1"
          style={{ gridTemplateColumns: `repeat(${cols}, 1.5rem)` }}
        >
          {grid.flatMap((row, r) =>
            row.map((cell, c) => (
              <button
                key={`${r}:${c}`}
                type="button"
                aria-label={`Row ${r + 1}, column ${c + 1}: ${
                  cell ? (sections.find((s) => s.id === cell)?.name ?? 'seat') : 'gap'
                }`}
                onClick={() => paint(r, c)}
                className={cn(
                  'size-6 rounded-sm border border-border',
                  cell === null
                    ? 'bg-transparent'
                    : TINTS[(sectionIndex.get(cell) ?? 0) % TINTS.length],
                )}
              />
            )),
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void save()} disabled={!valid || busy}>
          {busy ? 'Saving…' : 'Save layout'}
        </Button>
      </div>
      {!valid ? (
        <p className="text-caption text-muted-foreground">
          Name the layout, and make sure every section has at least one seat.
        </p>
      ) : null}
    </div>
  );
}

const blank = (rows: number, cols: number, section: string) =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => section as string | null));
