import type { Gender, Selection } from './selection';

/**
 * Per-seat gender for an assigned-seating order.
 *
 * One order can mix prices — two seats at the standard price and one at the
 * female price — so the choice is made PER SEAT. The URL carries two things:
 *
 *   - `sg`  — the default gender for every seat (the "apply to all" control);
 *   - `sgo` — overrides, `seatId:code` pairs joined by commas, where the code is
 *             `m`, `f` or `s` (an explicit STANDARD price, which has to be
 *             stored: without it a seat could not opt OUT of a non-empty default).
 *
 * Everything here is pure, because its failure modes are parsing hand-edited
 * URLs and the difference between "no override" and "override to standard".
 */

export type SeatGenderOverrides = Record<string, Gender | 'standard'>;

const TO_CODE = { male: 'm', female: 'f', standard: 's' } as const;
const FROM_CODE: Record<string, Gender | 'standard'> = {
  m: 'male',
  f: 'female',
  s: 'standard',
};
// A seat id is a UUID. Matching the shape (not just "non-empty") is what keeps a
// hand-edited `sgo` from smuggling a separator or an arbitrary string through.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSeatGenders(raw: string | null | undefined): SeatGenderOverrides {
  const out: SeatGenderOverrides = {};
  if (!raw) return out;
  for (const part of raw.split(',')) {
    const [id, code] = part.split(':');
    if (id && code && UUID.test(id) && code in FROM_CODE) out[id] = FROM_CODE[code]!;
  }
  return out;
}

export function serialiseSeatGenders(overrides: SeatGenderOverrides): string {
  return Object.entries(overrides)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => `${id}:${TO_CODE[value]}`)
    .join(',');
}

/** The gender a seat is priced at: its own override, else the default for the order. */
export function seatGenderFor(
  seatId: string,
  fallback: Gender | undefined,
  overrides: SeatGenderOverrides,
): Gender | undefined {
  const own = overrides[seatId];
  if (own === 'standard') return undefined;
  return own ?? fallback;
}

/** `{ seatId: gender }` for the seats a selection prices by gender — the API's `seat_genders`. */
export function seatGendersFromSelection(selection: Selection): Record<string, Gender> {
  const out: Record<string, Gender> = {};
  for (const line of selection) {
    if (!line.gender) continue;
    for (const id of line.seatIds ?? []) out[id] = line.gender;
  }
  return out;
}

/** Returns new overrides with one seat set; `undefined` means the standard price. */
export function withSeatGender(
  overrides: SeatGenderOverrides,
  seatId: string,
  gender: Gender | undefined,
): SeatGenderOverrides {
  return { ...overrides, [seatId]: gender ?? 'standard' };
}

/** Drops overrides for seats that are no longer selected. */
export function pruneSeatGenders(
  overrides: SeatGenderOverrides,
  seatIds: readonly string[],
): SeatGenderOverrides {
  const keep = new Set(seatIds);
  return Object.fromEntries(Object.entries(overrides).filter(([id]) => keep.has(id)));
}
