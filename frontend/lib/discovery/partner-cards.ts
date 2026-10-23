import { SUPPORT_EMAIL } from '@/lib/brand';

/**
 * The homepage's partner carousel: what the three cards say, where they go, and
 * HOW OFTEN each comes round.
 *
 * ── THE WEIGHTING LIVES HERE AND ONLY HERE ───────────────────────────────────
 *
 * `PARTNER_SEQUENCE` is the rotation. The carousel walks it in order and loops,
 * so the proportion each card gets is simply how many times it appears. Becoming
 * an organiser is the commercially important ask, so it takes every other slot:
 *
 *   Organiser → Venue → Organiser → Sponsor → Organiser → Venue
 *   (3 of 6)     (2 of 6)                       (1 of 6)
 *
 * Change the numbers by editing this array and nothing else — the dots, the
 * auto-advance and the tests all read it. `partner-cards.test.ts` pins the
 * invariants that must survive any edit: organiser is the most frequent, every
 * card appears at least once (so all three stay reachable), and no two
 * neighbouring slots are identical (so a rotation always visibly changes).
 */
export type PartnerCardId = 'organiser' | 'venue' | 'sponsor';

export const PARTNER_SEQUENCE: readonly PartnerCardId[] = [
  'organiser',
  'venue',
  'organiser',
  'sponsor',
  'organiser',
  'venue',
];

/** Milliseconds each slot stays up before the carousel advances. */
export const PARTNER_ROTATION_MS = 6000;

export type PartnerCard = {
  id: PartnerCardId;
  /** Short tab/dot label. */
  tab: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: { label: string; href: string };
};

/**
 * Where a venue or sponsor enquiry goes. Neither has a self-serve product, so
 * the honest destination is a person: a prefilled email when a support address
 * is configured, the contact page when it is not. A form that collected a
 * message and dropped it would be the worst thing to fake here.
 */
export function enquiryHref(subject: string, email: string = SUPPORT_EMAIL): string {
  return email ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : '/contact';
}

export const PARTNER_CARDS: Record<PartnerCardId, PartnerCard> = {
  organiser: {
    id: 'organiser',
    tab: 'Organisers',
    eyebrow: 'Become an organiser',
    title: 'Run your event on Curatix',
    body: 'Publish your event, sell tickets, scan guests in at the door and get paid after the show — all from one dashboard.',
    cta: { label: 'Start hosting', href: '/organizer' },
  },
  venue: {
    id: 'venue',
    tab: 'Venues',
    eyebrow: 'Become a venue partner',
    title: 'Put your space in front of organisers',
    body: 'Clubs, halls, rooftops and restaurants: tell us about your venue and the nights it suits, and we will connect you with organisers looking for a home.',
    cta: { label: 'Tell us about your venue', href: '/venue-partners' },
  },
  sponsor: {
    id: 'sponsor',
    tab: 'Sponsors',
    eyebrow: 'Become an event sponsor',
    title: 'Reach the people who show up',
    body: 'Back events your customers already love. Talk to us about sponsoring the right shows, festivals and series for your brand.',
    cta: { label: 'Explore sponsorship', href: '/sponsors' },
  },
};

/** The card shown at a position in the rotation (wraps around). */
export function cardAt(position: number): PartnerCard {
  const length = PARTNER_SEQUENCE.length;
  const id = PARTNER_SEQUENCE[((position % length) + length) % length] as PartnerCardId;
  return PARTNER_CARDS[id];
}

/** The first position a card appears at — where a dot or tab jumps to. */
export function firstPositionOf(id: PartnerCardId): number {
  return Math.max(0, PARTNER_SEQUENCE.indexOf(id));
}

/** How many of the slots belong to each card. */
export function slotCounts(): Record<PartnerCardId, number> {
  const counts: Record<PartnerCardId, number> = { organiser: 0, venue: 0, sponsor: 0 };
  for (const id of PARTNER_SEQUENCE) counts[id] += 1;
  return counts;
}
