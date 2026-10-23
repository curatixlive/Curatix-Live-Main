import { describe, expect, it } from 'vitest';
import {
  PARTNER_CARDS,
  PARTNER_SEQUENCE,
  cardAt,
  enquiryHref,
  firstPositionOf,
  slotCounts,
} from './partner-cards';

describe('the weighted partner rotation', () => {
  it('shows the organiser card more often than either other card', () => {
    const counts = slotCounts();
    expect(counts.organiser).toBeGreaterThan(counts.venue);
    expect(counts.organiser).toBeGreaterThan(counts.sponsor);
  });

  it('keeps all three cards in the rotation, so each stays reachable', () => {
    const counts = slotCounts();
    expect(counts.organiser).toBeGreaterThan(0);
    expect(counts.venue).toBeGreaterThan(0);
    expect(counts.sponsor).toBeGreaterThan(0);
  });

  it('never repeats a card in two neighbouring slots, including the wrap-around', () => {
    PARTNER_SEQUENCE.forEach((id, index) => {
      const next = PARTNER_SEQUENCE[(index + 1) % PARTNER_SEQUENCE.length];
      expect(next).not.toBe(id);
    });
  });

  it('opens on the organiser, so the main ask is the first thing seen', () => {
    expect(cardAt(0).id).toBe('organiser');
  });

  it('wraps in both directions', () => {
    const length = PARTNER_SEQUENCE.length;
    expect(cardAt(length).id).toBe(cardAt(0).id);
    expect(cardAt(-1).id).toBe(cardAt(length - 1).id);
  });

  it('jumps a dot to the first slot of its card', () => {
    for (const id of ['organiser', 'venue', 'sponsor'] as const) {
      expect(cardAt(firstPositionOf(id)).id).toBe(id);
    }
  });

  it('gives every card a real, non-empty destination', () => {
    for (const card of Object.values(PARTNER_CARDS)) {
      expect(card.cta.href.startsWith('/')).toBe(true);
      expect(card.cta.label.length).toBeGreaterThan(0);
    }
  });
});

describe('enquiryHref', () => {
  it('prefills an email when a support address is configured', () => {
    expect(enquiryHref('Venue partner', 'hello@example.com')).toBe(
      'mailto:hello@example.com?subject=Venue%20partner',
    );
  });
  it('falls back to the contact page rather than a dead link', () => {
    expect(enquiryHref('Venue partner', '')).toBe('/contact');
  });
});
