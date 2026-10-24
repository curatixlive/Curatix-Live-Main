import type { TicketTier } from '@/lib/api/types';

/**
 * Pre-sale and invite-only access, as the picker shows it.
 *
 * Display logic only. Whether somebody may actually buy is decided by the
 * server under the tier's lock from the access code or their relationship with
 * the organiser; this just decides what to draw, so a buyer with access is not
 * shown "Not on sale yet" for a tier they can buy.
 */

export type PresaleState = 'none' | 'upcoming' | 'open';

/** Where a tier stands relative to its pre-sale window, from the tier alone. */
export function presaleState(tier: TicketTier, now: Date = new Date()): PresaleState {
  if (!tier.presale_starts_at || !tier.sale_start) return 'none';
  if (now >= new Date(tier.sale_start)) return 'none'; // general sale has started
  return now >= new Date(tier.presale_starts_at) ? 'open' : 'upcoming';
}

/** Can this tier be bought now, for a buyer who does or does not have access? */
export function tierBuyable(tier: TicketTier, hasAccess: boolean, now: Date = new Date()): boolean {
  if (tier.available <= 0) return false;
  if (tier.is_on_sale) return true;
  return hasAccess && presaleState(tier, now) === 'open' && !saleEnded(tier, now);
}

function saleEnded(tier: TicketTier, now: Date): boolean {
  return tier.sale_end !== null && now > new Date(tier.sale_end);
}

/** Does this event have anything an access code could unlock? */
export function needsAccessGate(inviteOnly: boolean, tiers: readonly TicketTier[]): boolean {
  return inviteOnly || tiers.some((tier) => Boolean(tier.presale_starts_at));
}

/** A random, easy-to-read code for the organiser to start from. */
export function generateAccessCode(length = 8): string {
  // No 0/O/1/I: a code is read aloud and typed from a screenshot.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
}
