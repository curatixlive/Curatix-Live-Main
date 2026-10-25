'use client';

import * as React from 'react';
import { formatMoney } from '@/lib/discovery/format';
import { MAX_SEATS_PER_BOOKING } from '@/lib/booking/selection';
import { seatGenderFor } from '@/lib/booking/seat-gender';
import { cn } from '@/lib/utils/cn';
import { useBooking } from './booking-context';

/**
 * Choosing seats on an event with assigned seating.
 *
 * The grid is the venue's layout as the organiser drew it: a seat sits at its
 * (row, column), gaps are aisles. Availability is the live, uncached read —
 * a taken seat is shown taken, and the server decides again under a row-level
 * guard when the hold is made, so two people pressing the same seat cannot both
 * get it. Colour is never the only signal: every seat is a button with its row,
 * number, section and price in its accessible name, and taken seats say so.
 */

// Section tints, as design tokens — a venue has at most twelve, the legend names them.
const TINTS = [
  'border-primary/60',
  'border-success/70',
  'border-warning/70',
  'border-info/70',
  'border-destructive/50',
  'border-accent-foreground/50',
];

export function SeatPicker({ className }: { className?: string }) {
  const {
    seatMap,
    seatMapLoading,
    seatIds,
    toggleSeat,
    seatGender,
    setSeatGender,
    seatGenderOverrides,
    setSeatGenderFor,
  } = useBooking();

  if (seatMapLoading) {
    return <p className="text-body-sm text-muted-foreground">Loading the seat map…</p>;
  }
  if (!seatMap) {
    return (
      <p role="alert" className="text-body-sm text-muted-foreground">
        The seat map could not be loaded. Refresh to try again.
      </p>
    );
  }

  const chosen = new Set(seatIds);
  // The chosen seats whose section prices by gender — the ones a per-seat choice
  // means anything for. A seat in a section with no gender price is left out
  // rather than shown a control whose every option costs the same.
  const sectionById = new Map(seatMap.sections.map((section) => [section.id, section]));
  const pricedSeats = seatMap.seats
    .filter((seat) => chosen.has(seat.id))
    .flatMap((seat) => {
      const section = sectionById.get(seat.section_id);
      return section && hasGenderPrice(section)
        ? [
            {
              id: seat.id,
              label: seat.label,
              sectionName: section.name,
              prices: section.gender_prices ?? {},
            },
          ]
        : [];
    });
  const sectionIndex = new Map(seatMap.sections.map((section, i) => [section.id, i]));
  const sections = new Map(seatMap.sections.map((section) => [section.id, section]));
  const byCell = new Map(seatMap.seats.map((seat) => [`${seat.row}:${seat.col}`, seat]));
  const atLimit = seatIds.length >= (seatMap.max_per_booking || MAX_SEATS_PER_BOOKING);

  // Per row, which sections it holds — used to place the partitions.
  const bandKeys = Array.from({ length: seatMap.rows }, (_, r) => {
    const ids: string[] = [];
    for (let c = 0; c < seatMap.cols; c++) {
      const seat = byCell.get(`${r}:${c}`);
      if (seat && !ids.includes(seat.section_id)) ids.push(seat.section_id);
    }
    return ids.join('|');
  });
  const rows = Array.from({ length: seatMap.rows }, (_, r) => r);
  const cols = Array.from({ length: seatMap.cols }, (_, c) => c);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {seatMap.sections.some((section) => hasGenderPrice(section)) ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-caption font-bold uppercase tracking-wide text-muted-foreground">
            Price all selected seats as
          </legend>
          <div role="group" aria-label="Pricing for these seats" className="flex flex-wrap gap-2">
            {(
              [
                [undefined, 'Standard'],
                ['male', 'Male'],
                ['female', 'Female'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={seatGender === value}
                onClick={() => setSeatGender(value)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-body-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  seatGender === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-surface text-foreground hover:bg-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-caption text-muted-foreground">
            Optional. Pick one only if you want that price — the door sees what you chose.
          </p>
          {pricedSeats.length ? (
            <ul
              aria-label="Price each seat"
              className="mt-1 flex flex-col divide-y divide-border rounded-xl border border-border bg-surface"
            >
              {pricedSeats.map((seat) => {
                const current = seatGenderFor(seat.id, seatGender, seatGenderOverrides);
                return (
                  <li
                    key={seat.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2"
                  >
                    <span className="text-body-sm">
                      <span className="font-semibold">Seat {seat.label}</span>
                      <span className="text-muted-foreground"> · {seat.sectionName}</span>
                    </span>
                    <div
                      role="group"
                      aria-label={`Price for seat ${seat.label}`}
                      className="flex gap-1.5"
                    >
                      {(
                        [
                          [undefined, 'Standard'],
                          ['male', 'Male'],
                          ['female', 'Female'],
                        ] as const
                      )
                        .filter(
                          ([value]) => value === undefined || seat.prices[value] !== undefined,
                        )
                        .map(([value, label]) => (
                          <button
                            key={label}
                            type="button"
                            aria-pressed={current === value}
                            onClick={() => setSeatGenderFor(seat.id, value)}
                            className={cn(
                              'rounded-full border px-3 py-1 text-caption transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              current === value
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-surface text-foreground hover:bg-muted',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </fieldset>
      ) : null}

      <ul aria-label="Seat sections" className="flex flex-wrap gap-2">
        {seatMap.sections.map((section, i) => (
          <li
            key={section.id}
            className={cn(
              'rounded-full border-2 bg-surface px-3 py-1 text-caption text-foreground',
              TINTS[i % TINTS.length],
            )}
          >
            <span className="font-bold">{section.name}</span> · {formatMoney(section.price_minor)} ·{' '}
            {section.available} left
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="mb-2 text-center text-caption font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Stage
        </p>
        {/* On a phone the room is wider than the screen and scrolls sideways; a
            seat cut off at the edge looks like a seat that does not exist, so
            say it scrolls. Hidden from `sm`, where the whole room fits. */}
        <p className="mb-2 text-center text-caption text-muted-foreground sm:hidden">
          Swipe sideways to see every seat
        </p>
        <div className="overflow-x-auto overscroll-x-contain">
          <div role="group" aria-label="Seats" className="mx-auto flex w-max flex-col gap-1.5">
            {rows.map((r) => {
              // The sections present in this row, left to right. A heading is
              // drawn whenever that set changes from the row above, so each
              // block of seats sits under its own title and price.
              const present: string[] = [];
              for (const c of cols) {
                const seat = byCell.get(`${r}:${c}`);
                if (seat && !present.includes(seat.section_id)) present.push(seat.section_id);
              }
              const key = present.join('|');
              const previous = r > 0 ? bandKeys[r - 1] : undefined;
              const heading = key && key !== previous ? present : null;
              return (
                <React.Fragment key={r}>
                  {heading ? (
                    <div
                      className={cn(
                        'flex flex-wrap items-center gap-x-3 gap-y-1',
                        r > 0 ? 'mt-3 border-t border-border pt-3' : '',
                      )}
                    >
                      {heading.map((id) => {
                        const section = sections.get(id);
                        const i = sectionIndex.get(id) ?? 0;
                        return (
                          <p
                            key={id}
                            className="flex items-center gap-2 text-caption font-bold uppercase tracking-wide text-foreground"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'size-3 rounded-full border-2',
                                TINTS[i % TINTS.length],
                              )}
                            />
                            {section?.name}
                            <span className="font-normal normal-case text-muted-foreground">
                              {formatMoney(section?.price_minor ?? 0)}
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  ) : null}
                  <div
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${seatMap.cols}, 2rem)` }}
                  >
                    {cols.map((c) => {
                      const seat = byCell.get(`${r}:${c}`);
                      if (!seat) return <span key={`${r}:${c}`} aria-hidden className="size-8" />;
                      const section = sections.get(seat.section_id);
                      const idx = sectionIndex.get(seat.section_id) ?? 0;
                      const taken = seat.status !== 'available';
                      const picked = chosen.has(seat.id);
                      const blocked = taken || (!picked && atLimit);
                      return (
                        <button
                          key={seat.id}
                          type="button"
                          aria-pressed={picked}
                          aria-label={`Seat ${seat.label}, ${section?.name ?? ''}, ${formatMoney(
                            section?.price_minor ?? 0,
                          )}${taken ? ', not available' : ''}`}
                          disabled={blocked}
                          onClick={() => toggleSeat(seat.id)}
                          className={cn(
                            'flex size-8 touch-manipulation items-center justify-center rounded-md border-2 text-caption font-bold transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            picked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : taken
                                ? 'cursor-not-allowed border-border bg-muted text-muted-foreground line-through'
                                : cn(
                                    'bg-surface text-foreground hover:bg-muted',
                                    TINTS[idx % TINTS.length],
                                  ),
                          )}
                        >
                          {seat.label}
                        </button>
                      );
                    })}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-caption text-muted-foreground" aria-live="polite">
        {seatIds.length
          ? `${seatIds.length} seat${seatIds.length === 1 ? '' : 's'} selected`
          : 'Pick your seats'}
        {atLimit ? ` — the most you can book at once is ${seatMap.max_per_booking}.` : '.'}
      </p>
    </div>
  );
}

const hasGenderPrice = (section: { gender_prices?: { male?: number; female?: number } }) =>
  section.gender_prices?.male !== undefined || section.gender_prices?.female !== undefined;
