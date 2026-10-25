import type { TicketTier } from '@/lib/api/types';
import { unitPriceAt } from '@/lib/discovery/tiers';
import { presaleState } from './access';

/**
 * What the user has chosen, and what it costs.
 *
 * THE SELECTION LIVES IN THE URL. Four screens share it, and the alternatives
 * all fail somewhere real: React state dies on refresh, `sessionStorage` can't
 * be linked or restored after a crash, and a server session doesn't exist. A
 * query string survives reload, back/forward, a shared link and a browser
 * restart — which matters most precisely here, because someone who loses their
 * basket at the payment step does not rebuild it.
 *
 * Encoded as `tickets=<tierId>:<qty>,<tierId>:<qty>` — short enough to read in
 * the address bar, and order-preserving so the summary doesn't reshuffle.
 *
 * MONEY IS INTEGER MINOR UNITS end to end, exactly as the backend sends it.
 * Nothing here ever divides by 100 — only the formatter does, once, at render.
 */

/** A self-declared gender, used only where a tier prices by it. */
export type Gender = 'male' | 'female';

export type Selection = {
  tierId: string;
  quantity: number;
  seatIds?: string[];
  /** Absent for the standard price. One line per (tier, gender). */
  gender?: Gender;
}[];

const GENDER_CODES: Record<string, Gender> = { m: 'male', f: 'female' };
const genderCode = (gender: Gender | undefined): string =>
  gender === 'male' ? 'm' : gender === 'female' ? 'f' : '';

export const SELECTION_PARAM = 'tickets';

/**
 * Which showtime, for an event that runs more than once.
 *
 * A SEPARATE param from the selection, and deliberately not a field on
 * `Selection`. Two reasons, and the second is the money path:
 *
 * 1. `slot_id` belongs to the TIER, not to a line. `toBookingItems` sends
 *    `{ticket_type_id, quantity}` and `CreateBookingRequestSerializer` accepts
 *    nothing else, so a session inside a line would be refused by the API.
 * 2. `selectionSignature` feeds `idempotencyKeyFor` and is compared against
 *    `bookingItemsSignature`, which is built from SERVER items that can never
 *    carry a slot. Adding it to one side of that comparison makes every live
 *    reservation read as stale — and the review screen answers a stale hold by
 *    cancelling and re-reserving it.
 *
 * Same split the browse filters make between a named window (`when`) and a
 * chosen range (`dateFrom`/`dateTo`): related, separately addressed.
 */
export const SESSION_PARAM = 'session';

/** Which seats were chosen, on an event with assigned seating. */
export const SEATS_PARAM = 'seats';

export const MAX_SEATS_PER_BOOKING = 10;

export function parseSeatIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const part of value.split(',')) {
    const id = part.trim();
    if (/^[0-9a-f-]{36}$/i.test(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, MAX_SEATS_PER_BOOKING);
}

export const serialiseSeatIds = (ids: readonly string[]): string => ids.join(',');

export function parseSelection(value: string | null | undefined): Selection {
  if (!value) return [];
  const seen = new Set<string>();
  const lines: Selection = [];
  for (const part of value.split(',')) {
    const [tierId, rawQuantity, rawGender] = part.split(':');
    const quantity = Number(rawQuantity);
    if (!tierId || !Number.isInteger(quantity) || quantity < 1) continue;
    // An unknown gender code is dropped to the standard price rather than
    // trusted: the server re-checks it, but a hand-edited link should degrade.
    const gender = rawGender ? GENDER_CODES[rawGender] : undefined;
    const key = `${tierId}:${genderCode(gender)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(gender ? { tierId, quantity, gender } : { tierId, quantity });
  }
  return lines;
}

export const serialiseSelection = (selection: Selection): string =>
  selection
    .filter((line) => line.quantity > 0)
    .map((line) =>
      line.gender
        ? `${line.tierId}:${line.quantity}:${genderCode(line.gender)}`
        : `${line.tierId}:${line.quantity}`,
    )
    .join(',');

export function setQuantity(
  selection: Selection,
  tierId: string,
  quantity: number,
  gender?: Gender,
): Selection {
  const without = selection.filter((line) => !(line.tierId === tierId && line.gender === gender));
  if (quantity <= 0) return without;
  return [...without, gender ? { tierId, quantity, gender } : { tierId, quantity }];
}

export const quantityFor = (selection: Selection, tierId: string, gender?: Gender): number =>
  selection.find((line) => line.tierId === tierId && line.gender === gender)?.quantity ?? 0;

/** Every ticket of this tier in the basket, whatever price each was chosen at. */
export const tierQuantityFor = (selection: Selection, tierId: string): number =>
  selection.filter((line) => line.tierId === tierId).reduce((sum, line) => sum + line.quantity, 0);

export type SelectionLine = {
  tier: TicketTier;
  quantity: number;
  /** `unit price × quantity`, minor units — at the tier's EFFECTIVE price. */
  subtotal: number;
  /**
   * What one ticket of this tier costs right now, minor units. Carried on the
   * line so a caller renders the same number the subtotal was built from rather
   * than reaching back into `tier.price`, which is the face price.
   */
  unitPrice: number;
  /**
   * The live sale phase's name, null when this line is at face price. It is the
   * label to show BEFORE a booking exists; once one does, the booking item's own
   * recorded `phase_name` is authoritative.
   */
  phaseName: string | null;
  /** The gender this line is priced at, when the tier prices by gender. */
  gender?: Gender;
};

export type SelectionTotals = {
  lines: SelectionLine[];
  ticketCount: number;
  /**
   * What the TICKETS cost — the "Order amount" line on the checkout.
   *
   * This used to be the whole charge, because the fee was deducted from the
   * organizer's share rather than added to the customer's bill. It is now one
   * of three terms; `grandTotal` is what a card is debited for. Anything that
   * renders `total` as the price somebody pays is now understating it.
   */
  total: number;
  /**
   * The platform's fee, 1% of `total`, and PART OF `grandTotal`.
   *
   * The old comment here said the opposite — "taken OUT at settlement, NOT a
   * surcharge, adding it would be a lie". That was true of a flat per-ticket fee
   * deducted from the organizer. The fee is charged on top now, the organizer
   * receives the full ticket subtotal, and the number that would be a lie is a
   * total that leaves it out.
   */
  platformFee: number;
  /** What the customer actually pays: tickets + fee (+ any donation). */
  grandTotal: number;
  /** True when a line asks for more than that tier still has. */
  overAvailable: boolean;
  /**
   * The basket holds tiers from two different showtimes — a MULTI-DAY order.
   *
   * Informational, not a blocker: it used to stop Checkout on the belief that
   * one booking could not admit somebody to two evenings. That was true of the
   * ticket, not the booking — every ticket belongs to its own tier and slot, the
   * door checks each against ITS session's window, and the reserve is
   * all-or-nothing across tiers. The flag now only drives the note telling the
   * buyer their order spans sessions.
   */
  crossSession: boolean;
  /**
   * A line holds a tier whose sale window is not open.
   *
   * Blocks Checkout, like the two above it, and it is the LAST place a
   * future-dated event can be stopped before the money path. The picker
   * already draws such a tier disabled, so this is unreachable by pressing
   * things — and entirely reachable by a URL, because `?tickets=<id>:2` is
   * written by the event page's own panel, survives in histories and in
   * links people send each other, and `parseSelection` will happily carry a
   * tier the picker would never have let anybody choose.
   *
   * Without it the reserve runs, `SaleNotStartedError` comes back from under
   * the tier's row lock, and the customer reads "We could not hold your
   * tickets. An unexpected error occurred." — for an event that has simply
   * not gone on sale.
   */
  notOnSale: boolean;
};

/**
 * Matches the backend's `PLATFORM_FEE_BPS`. 100 basis points = 1%.
 *
 * Basis points and integer arithmetic on both sides, rounded half up, so this
 * estimate and the amount the lock actually bills agree to the paise. A float
 * percentage here would disagree with Python's integer division on exactly the
 * orders where a customer would notice.
 */
export const PLATFORM_FEE_BPS = 100;

/** The legacy flat fee on a ticket subtotal, in whole paise. */
export const platformFeeFor = (subtotalMinor: number) =>
  Math.floor((subtotalMinor * PLATFORM_FEE_BPS + 5_000) / 10_000);

/**
 * The buyer's per-ticket fee schedule — mirrors `apps/booking/fees.py`. The
 * organiser receives the full ticket price; this is ADDED for the customer.
 * The defaults match the backend's settings; an admin can override them per
 * event, and `GET /events/{id}/fees` returns the schedule actually in force.
 */
export type FeeSchedule = {
  gateway_bps: number;
  platform_bps: number;
  platform_min_minor: number;
};

export const DEFAULT_FEE_SCHEDULE: FeeSchedule = {
  gateway_bps: 200,
  platform_bps: 200,
  platform_min_minor: 1000,
};

const pct = (amount: number, bps: number) => Math.floor((amount * bps + 5_000) / 10_000);

/** Per ticket: gateway% + max(platform%, minimum). A free ticket has no fee. */
export function buyerFeeFor(
  lines: { unitPrice: number; quantity: number }[],
  schedule: FeeSchedule = DEFAULT_FEE_SCHEDULE,
): number {
  return lines.reduce((fee, line) => {
    if (line.unitPrice <= 0 || line.quantity <= 0) return fee;
    const perTicket =
      pct(line.unitPrice, schedule.gateway_bps) +
      Math.max(pct(line.unitPrice, schedule.platform_bps), schedule.platform_min_minor);
    return fee + perTicket * line.quantity;
  }, 0);
}

/**
 * Mirrors the backend's `DONATION_MAX_MINOR`.
 *
 * The server is what actually enforces it — this copy only stops the UI
 * offering an amount that would be refused, which is a better experience than a
 * 400 but is not a security boundary and must never be mistaken for one.
 */
export const DONATION_MAX_MINOR = 100_000;

/**
 * THIS IS AN ESTIMATE, AND IT HAS TO MATCH WHAT THE LOCK WILL CHARGE.
 *
 * It prices every line at `effective_price` — the live sale-phase price — not at
 * the tier's face price. Quoting the face price OVERSTATED a discounted order:
 * somebody choosing two ₹799 Early bird tickets was shown ₹1,998, pressed
 * "Continue", and the booking the backend then created said ₹1,598. A funnel
 * whose first number is wrong about money is the one place that cannot be
 * hand-waved as a display detail.
 *
 * It stays an estimate for a reason this cannot fix: the CHARGE is decided under
 * the tier's row lock, and the straddle rule means an order that does not fit
 * inside the phase's remaining seats bills at the NEXT price for the whole
 * order. So the moment a booking exists the funnel stops using this and reads
 * the booking's own `total_amount` and each item's recorded `unit_price` —
 * which is what every screen after the picker already does.
 */
export function totalsFor(
  selection: Selection,
  tiers: TicketTier[],
  options: { hasAccess?: boolean; fees?: FeeSchedule } = {},
): SelectionTotals {
  const lines: SelectionLine[] = [];
  for (const line of selection) {
    const tier = tiers.find((candidate) => candidate.id === line.tierId);
    if (!tier) continue; // a tier that vanished between screens simply drops out
    // QUANTITY-AWARE, mirroring `decide_unit_price` on the server: a group
    // band makes the per-ticket price depend on how many are being bought.
    // `unitPriceFor` (phase only) would quote the face price for a group order
    // and then be corrected downward by the reserve — an estimate that is
    // wrong in the buyer's favour is still an estimate that does not match the
    // screen after it.
    const unitPrice = genderUnitPrice(tier, line.quantity, line.gender);
    lines.push({
      tier,
      quantity: line.quantity,
      subtotal: unitPrice * line.quantity,
      unitPrice,
      phaseName: tier.current_phase?.name ?? null,
      // Only a gender the tier actually has a price for is carried: the server
      // stores nothing for one that earned no discount, and the screen must not
      // claim otherwise.
      ...(line.gender && tier.gender_prices?.[line.gender] !== undefined
        ? { gender: line.gender }
        : {}),
    });
  }
  const ticketCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const platformFee = buyerFeeFor(lines, options.fees);
  return {
    lines,
    ticketCount,
    total,
    platformFee,
    // No donation term here on purpose: a donation is chosen on the review
    // screen, after this estimate has done its job. The screen that offers it
    // adds it to this number, and the BOOKING's own `total_amount` supersedes
    // all of it the moment one exists.
    grandTotal: total + platformFee,
    // Per TIER, not per line: two lines of one tier draw on the same stock.
    overAvailable: lines.some(
      (line) =>
        lines
          .filter((other) => other.tier.id === line.tier.id)
          .reduce((s, o) => s + o.quantity, 0) > line.tier.available,
    ),
    crossSession: spansTwoSessions(lines),
    notOnSale: lines.some(
      (line) => !line.tier.is_on_sale && !(options.hasAccess && presaleState(line.tier) === 'open'),
    ),
  };
}

/**
 * Does this basket span two showtimes?
 *
 * ── THE BUG THIS CATCHES ─────────────────────────────────────────────────
 *
 * `parseSelection` dedupes on `tierId` alone, so two tiers belonging to two
 * different sessions both survive and become ONE booking spanning two
 * evenings. Nothing else notices: `totalsFor` sums them without complaint,
 * `overAvailable` is per-line, and the backend cannot see it either — it
 * receives tier ids and nothing about slots.
 *
 * It was unreachable while no UI knew sessions existed. It became reachable
 * the moment the funnel grew a session picker, because switching showtime with
 * a stale `tickets=` param in the URL is exactly how you build one.
 *
 * Tiers with `slot_id === null` are event-wide — they admit to every show — so
 * they never conflict with anything. Only two DISTINCT non-null slots do.
 */
function spansTwoSessions(lines: SelectionLine[]): boolean {
  const slots = new Set<string>();
  for (const line of lines) {
    const slotId = line.tier.slot_id;
    if (slotId) slots.add(slotId);
  }
  return slots.size > 1;
}

/**
 * What one ticket of this tier costs for a buyer who picked this gender — the
 * ESTIMATE the picker shows. The server decides the charge under the tier's lock.
 *
 * A gender price replaces the face price; a live phase or group band can still
 * lower it, exactly as they lower the face price (`decide_unit_price`).
 */
export function genderUnitPrice(tier: TicketTier, quantity: number, gender?: Gender): number {
  const own = gender ? tier.gender_prices?.[gender] : undefined;
  const base = unitPriceAt(tier, quantity);
  if (own === undefined) return base;
  const discounted = base < tier.price;
  return discounted ? Math.min(own, base) : own;
}

/** The API shape `POST /bookings` expects. */
export const toBookingItems = (selection: Selection) =>
  selection.map((line) => ({
    ticket_type_id: line.tierId,
    quantity: line.quantity,
    ...(line.gender ? { gender: line.gender } : {}),
  }));

/** The seats a basket names, in a stable order — empty for general admission. */
export const toSeatIds = (selection: Selection): string[] =>
  selection.flatMap((line) => line.seatIds ?? []).sort();

/**
 * A stable idempotency key for one checkout ATTEMPT at a selection.
 *
 * Derived from the intent (this event, these tiers, these quantities) rather
 * than randomly generated, so a double-tap, a retry after a dropped connection,
 * and a reload-then-continue all resolve to ONE booking. A random key would
 * make each of those reserve a fresh set of tickets against the same person.
 *
 * ── AND THE ATTEMPT, WHICH IS WHY IT IS NOT JUST THE SELECTION ────────────
 *
 * Without it "two General tickets for this event" was the same string for ever,
 * so the key could not tell a RETRY from a SECOND PURCHASE. Buying those two
 * tickets made them permanently unbuyable by that account: the server replayed
 * the settled booking, the checkout showed its stale total, and Pay opened a
 * provider order that had already been captured.
 *
 * `attempt` is STABLE for as long as one checkout is in progress and is bumped
 * only when the booking that came back cannot be paid for — see
 * `lib/booking/attempt.ts`. Every protection the derived key was written for is
 * intact; what changes is that a finished attempt stops speaking for the next.
 *
 * It defaults to 1 so a caller with no attempt store (a test, a server render)
 * produces exactly the key this function produced before attempts existed.
 *
 * The user id is deliberately absent: the backend already scopes the key to the
 * authenticated user, so including it here would only make the key longer.
 */
export function idempotencyKeyFor(eventId: string, selection: Selection, attempt = 1): string {
  return `book:${eventId}:${selectionSignature(selection)}:a${attempt}`;
}

/**
 * An order-independent fingerprint of what was chosen.
 *
 * Extracted from `idempotencyKeyFor` so the review screen can ask the one
 * question it could not ask before: **is the booking I am holding still the
 * booking this URL describes?**
 *
 * It could not, and that was a money-path bug. `BookingProvider` lives in the
 * checkout LAYOUT, so the reserved booking survives a trip back to the picker;
 * the reserve effect short-circuits on `|| booking`; and the order lines render
 * from `booking.items`. So changing the quantity and coming forward showed —
 * and charged for — the ORIGINAL selection, with the URL and the picker both
 * saying something else. Nothing failed and nothing said anything.
 *
 * Both signatures are built the same way, from the same sort, so a booking and
 * a selection can never disagree for a reason as trivial as ordering.
 */
export function selectionSignature(selection: Selection): string {
  return (
    [...selection]
      .filter((line) => line.quantity > 0)
      .sort(
        (a, b) =>
          a.tierId.localeCompare(b.tierId) || (a.gender ?? '').localeCompare(b.gender ?? ''),
      )
      // The SEATS are part of the identity: two baskets with one VIP seat each are
      // different purchases, and sharing a signature would share an idempotency key
      // and replay the first buyer's choice of seat. The GENDER is too: the same
      // tickets at a different price are a different order.
      .map((line) => {
        const base = `${line.tierId}:${line.quantity}${line.gender ? `:${genderCode(line.gender)}` : ''}`;
        return line.seatIds?.length ? `${base}[${[...line.seatIds].sort().join('+')}]` : base;
      })
      .join(',')
  );
}

/** The tier counts alone — what a booking's own line items can be compared with. */
export function tierSignature(selection: Selection): string {
  return perTierSignature(selection.map((line) => ({ id: line.tierId, quantity: line.quantity })));
}

/**
 * Totals per TIER — never per line. A booking's own items split by gender only
 * where a gender price applied, while the basket splits by whatever the buyer
 * picked, so comparing lines would call a perfectly matching hold "stale" and
 * cancel it. Per tier, the two always agree.
 */
function perTierSignature(rows: ReadonlyArray<{ id: string; quantity: number }>): string {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.quantity > 0) totals.set(row.id, (totals.get(row.id) ?? 0) + row.quantity);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, quantity]) => `${id}:${quantity}`)
    .join(',');
}

export function bookingItemsSignature(
  items: ReadonlyArray<{ ticket_type_id: string; quantity: number }>,
): string {
  return perTierSignature(
    items.map((item) => ({ id: item.ticket_type_id, quantity: item.quantity })),
  );
}

/**
 * Which of the chosen seats still stand.
 *
 * Only the PICKER may drop seats that are no longer available. Once a hold
 * exists those very seats read as `held` — by us — so applying the same filter
 * on the review screen empties the basket the moment the seat map refreshes,
 * the screen's empty-basket guard bounces back to the picker, and the picker
 * cancels the hold underneath a payment in progress. Money captured against a
 * cancelled hold is refunded automatically, which is exactly what customers
 * saw: pay, then "refund received".
 */
export function standingSeatIds(
  ids: readonly string[],
  seats: ReadonlyArray<{ id: string; status: string }> | null,
  onPicker: boolean,
): string[] {
  if (!seats || !onPicker) return [...ids];
  const open = new Set(seats.filter((seat) => seat.status === 'available').map((seat) => seat.id));
  return ids.filter((id) => open.has(id));
}
