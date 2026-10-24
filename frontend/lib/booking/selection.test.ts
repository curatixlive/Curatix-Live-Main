import { describe, expect, it } from 'vitest';
import type { TicketTier } from '@/lib/api/types';
import {
  bookingItemsSignature,
  genderUnitPrice,
  quantityFor,
  serialiseSelection,
  setQuantity,
  tierQuantityFor,
  toBookingItems,
  SELECTION_PARAM,
  SESSION_PARAM,
  idempotencyKeyFor,
  parseSeatIds,
  parseSelection,
  selectionSignature,
  standingSeatIds,
  tierSignature,
  toSeatIds,
  totalsFor,
} from './selection';

/**
 * The basket arithmetic, and the guard that stops one booking spanning two
 * evenings.
 *
 * `totalsFor` had NO test coverage at all before this file, which is how the
 * cross-session hole survived: it is not a bug in any one line, it is a fact
 * about two lines being allowed to coexist.
 */

function tier(overrides: Partial<TicketTier> & { id: string }): TicketTier {
  return {
    event_id: 'evt',
    slot_id: null,
    name: 'GA',
    description: '',
    perks: [],
    position: 0,
    price: 50_000,
    effective_price: 50_000,
    current_phase: null,
    next_price: null,
    phases: [],
    quantity: 100,
    sold: 0,
    available: 100,
    sale_start: null,
    sale_end: null,
    max_per_order: 10,
    is_on_sale: true,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('the two URL params are separate, and stay separate', () => {
  it('does not share a name', () => {
    // The session is NOT a field on `Selection`, and this is the cheapest
    // possible reminder of why: `selectionSignature` feeds `idempotencyKeyFor`
    // on the money path and is compared against a signature built from SERVER
    // items, which can never carry a slot. Folding them together makes every
    // live reservation compare as stale, which the review screen answers by
    // cancelling and re-reserving.
    expect(SELECTION_PARAM).not.toBe(SESSION_PARAM);
  });
});

describe('totalsFor', () => {
  it('sums the lines it can resolve and prices them at the effective price', () => {
    const tiers = [tier({ id: 'ga', effective_price: 40_000 })];
    const totals = totalsFor(parseSelection('ga:2'), tiers);

    expect(totals.ticketCount).toBe(2);
    expect(totals.total).toBe(80_000);
    expect(totals.lines).toHaveLength(1);
  });

  it('drops a tier that no longer exists rather than throwing', () => {
    // A tier can vanish between screens (an organiser retires it mid-checkout).
    // The basket thinning is the honest outcome; a crash is not.
    const totals = totalsFor(parseSelection('gone:2'), [tier({ id: 'ga' })]);

    expect(totals.lines).toHaveLength(0);
    expect(totals.ticketCount).toBe(0);
  });

  it('flags a quantity above what is left', () => {
    const totals = totalsFor(parseSelection('ga:5'), [tier({ id: 'ga', available: 3 })]);

    expect(totals.overAvailable).toBe(true);
  });

  describe('crossSession', () => {
    it('is false for an ordinary single-show event', () => {
      const tiers = [tier({ id: 'ga' }), tier({ id: 'vip' })];

      expect(totalsFor(parseSelection('ga:1,vip:1'), tiers).crossSession).toBe(false);
    });

    it('is false when every line belongs to the SAME session', () => {
      const tiers = [tier({ id: 'ga-6', slot_id: 'six' }), tier({ id: 'vip-6', slot_id: 'six' })];

      expect(totalsFor(parseSelection('ga-6:1,vip-6:1'), tiers).crossSession).toBe(false);
    });

    it('is TRUE when two lines belong to two different sessions', () => {
      // The reachable failure: switch showtime with a stale `tickets=` param in
      // the URL and this is the basket you get. `POST /bookings` receives tier
      // ids and nothing about slots, so the server cannot refuse it — one
      // booking would admit somebody to two evenings.
      const tiers = [tier({ id: 'ga-6', slot_id: 'six' }), tier({ id: 'ga-9', slot_id: 'nine' })];

      expect(totalsFor(parseSelection('ga-6:1,ga-9:1'), tiers).crossSession).toBe(true);
    });

    it('does not count an event-wide tier as a second session', () => {
      // `slot_id === null` admits to EVERY show, so it never conflicts. A
      // festival pass beside one night's ticket is a legitimate basket.
      const tiers = [tier({ id: 'pass', slot_id: null }), tier({ id: 'ga-6', slot_id: 'six' })];

      expect(totalsFor(parseSelection('pass:1,ga-6:1'), tiers).crossSession).toBe(false);
    });

    it('is false for a basket of only event-wide tiers', () => {
      const tiers = [tier({ id: 'pass' }), tier({ id: 'vip' })];

      expect(totalsFor(parseSelection('pass:1,vip:1'), tiers).crossSession).toBe(false);
    });
  });
});

describe('seats in the selection', () => {
  const id = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;

  it('parses seat ids, dropping junk and duplicates and capping at ten', () => {
    expect(parseSeatIds(`${id(1)},nope,${id(1)},${id(2)}`)).toEqual([id(1), id(2)]);
    const many = Array.from(
      { length: 14 },
      (_, i) => `00000000-0000-0000-0000-0000000000${10 + i}`,
    );
    expect(parseSeatIds(many.join(','))).toHaveLength(10);
  });

  it('gives different seats a different signature, so they never share an idempotency key', () => {
    const a = [{ tierId: 't', quantity: 1, seatIds: [id(1)] }];
    const b = [{ tierId: 't', quantity: 1, seatIds: [id(2)] }];
    expect(selectionSignature(a)).not.toBe(selectionSignature(b));
    expect(idempotencyKeyFor('e', a)).not.toBe(idempotencyKeyFor('e', b));
  });

  it('is order-independent over the same seats', () => {
    const a = [{ tierId: 't', quantity: 2, seatIds: [id(1), id(2)] }];
    const b = [{ tierId: 't', quantity: 2, seatIds: [id(2), id(1)] }];
    expect(selectionSignature(a)).toBe(selectionSignature(b));
  });

  it('lists the seats a basket names, and none for general admission', () => {
    expect(toSeatIds([{ tierId: 't', quantity: 2, seatIds: [id(2), id(1)] }])).toEqual([
      id(1),
      id(2),
    ]);
    expect(toSeatIds([{ tierId: 't', quantity: 2 }])).toEqual([]);
  });

  it('tierSignature ignores seats so a booking’s own lines compare equal', () => {
    const sel = [{ tierId: 't', quantity: 1, seatIds: [id(1)] }];
    expect(tierSignature(sel)).toBe('t:1');
  });
});

describe('standingSeatIds', () => {
  const seats = [
    { id: 'a', status: 'available' },
    { id: 'b', status: 'held' },
    { id: 'c', status: 'sold' },
  ];
  it('drops taken seats on the picker', () => {
    expect(standingSeatIds(['a', 'b', 'c'], seats, true)).toEqual(['a']);
  });
  it('keeps held seats on review, or the hold is cancelled under a payment', () => {
    expect(standingSeatIds(['a', 'b'], seats, false)).toEqual(['a', 'b']);
  });
  it('keeps everything until the seat map has loaded', () => {
    expect(standingSeatIds(['a', 'b'], null, true)).toEqual(['a', 'b']);
  });
});

describe('gender lines', () => {
  const T = 'tier-1';

  it('round-trips through the URL, one line per (tier, gender)', () => {
    const selection = [
      { tierId: T, quantity: 2, gender: 'female' as const },
      { tierId: T, quantity: 1, gender: 'male' as const },
      { tierId: T, quantity: 3 },
    ];
    expect(parseSelection(serialiseSelection(selection))).toEqual(selection);
  });

  it('drops a repeated (tier, gender) and an unknown gender code', () => {
    expect(parseSelection(`${T}:1:f,${T}:2:f`)).toEqual([
      { tierId: T, quantity: 1, gender: 'female' },
    ]);
    expect(parseSelection(`${T}:2:x`)).toEqual([{ tierId: T, quantity: 2 }]);
  });

  it('sets and reads one gender without disturbing the others', () => {
    let selection = setQuantity([], T, 1, 'male');
    selection = setQuantity(selection, T, 2, 'female');
    selection = setQuantity(selection, T, 1);
    expect(quantityFor(selection, T, 'male')).toBe(1);
    expect(quantityFor(selection, T, 'female')).toBe(2);
    expect(quantityFor(selection, T)).toBe(1);
    expect(tierQuantityFor(selection, T)).toBe(4);
    expect(setQuantity(selection, T, 0, 'female').some((l) => l.gender === 'female')).toBe(false);
  });

  it('is sent to the server per line, and only where chosen', () => {
    expect(
      toBookingItems([
        { tierId: T, quantity: 1, gender: 'female' },
        { tierId: T, quantity: 2 },
      ]),
    ).toEqual([
      { ticket_type_id: T, quantity: 1, gender: 'female' },
      { ticket_type_id: T, quantity: 2 },
    ]);
  });

  it('prices a chosen gender at its own price, and the rest at the normal one', () => {
    const priced = tier({
      id: T,
      gender_prices: { male: 149_900, female: 129_900 },
      price: 99_900,
      effective_price: 99_900,
    });
    expect(genderUnitPrice(priced, 1, 'male')).toBe(149_900);
    expect(genderUnitPrice(priced, 1, 'female')).toBe(129_900);
    expect(genderUnitPrice(priced, 1)).toBe(99_900);
  });

  it('totals each line at its own price and names the gender only where it applied', () => {
    const priced = tier({ id: T, gender_prices: { female: 40_000 } });
    const totals = totalsFor(
      [
        { tierId: T, quantity: 2, gender: 'female' },
        { tierId: T, quantity: 1, gender: 'male' },
      ],
      [priced],
    );
    expect(totals.total).toBe(2 * 40_000 + 50_000);
    expect(totals.lines.map((line) => line.gender)).toEqual(['female', undefined]);
  });

  it('counts two lines of one tier against ONE stock', () => {
    const scarce = tier({ id: T, available: 3, gender_prices: { female: 40_000 } });
    const totals = totalsFor(
      [
        { tierId: T, quantity: 2, gender: 'female' },
        { tierId: T, quantity: 2 },
      ],
      [scarce],
    );
    expect(totals.overAvailable).toBe(true);
  });

  it('gives different genders different idempotency keys, and compares a hold per tier', () => {
    const a = [{ tierId: T, quantity: 1, gender: 'male' as const }];
    const b = [{ tierId: T, quantity: 1, gender: 'female' as const }];
    expect(selectionSignature(a)).not.toBe(selectionSignature(b));
    // The hold's own lines split only where a gender price applied; the basket
    // splits by whatever was picked. Per tier they must agree or a matching
    // hold is cancelled as "stale".
    expect(tierSignature([...a, { tierId: T, quantity: 2 }])).toBe(
      bookingItemsSignature([{ ticket_type_id: T, quantity: 3 }]),
    );
  });
});
