import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PARTNER_CARDS } from '@/lib/discovery/partner-cards';
import { PartnerCarousel } from './partner-carousel';

const activeEyebrow = () =>
  document.querySelector('article span.inline-flex')?.textContent?.trim() ?? '';

describe('PartnerCarousel', () => {
  it('opens on the organiser card, so the main ask is seen first', () => {
    render(<PartnerCarousel />);
    expect(activeEyebrow()).toBe(PARTNER_CARDS.organiser.eyebrow);
    expect(screen.getByRole('link', { name: /Start hosting/ })).toHaveAttribute(
      'href',
      '/organizer',
    );
  });

  it('keeps every card reachable by hand', () => {
    render(<PartnerCarousel />);
    fireEvent.click(screen.getByRole('button', { name: `Show: ${PARTNER_CARDS.venue.eyebrow}` }));
    expect(activeEyebrow()).toBe(PARTNER_CARDS.venue.eyebrow);
    expect(screen.getByRole('link', { name: /Tell us about your venue/ })).toHaveAttribute(
      'href',
      '/venue-partners',
    );
    fireEvent.click(screen.getByRole('button', { name: `Show: ${PARTNER_CARDS.sponsor.eyebrow}` }));
    expect(activeEyebrow()).toBe(PARTNER_CARDS.sponsor.eyebrow);
    expect(screen.getByRole('link', { name: /Explore sponsorship/ })).toHaveAttribute(
      'href',
      '/sponsors',
    );
  });

  it('steps through the weighted sequence with the arrows', () => {
    render(<PartnerCarousel />);
    const next = screen.getByRole('button', { name: 'Next partner option' });
    fireEvent.click(next);
    expect(activeEyebrow()).toBe(PARTNER_CARDS.venue.eyebrow);
    fireEvent.click(next);
    // Organiser comes round again between the other two.
    expect(activeEyebrow()).toBe(PARTNER_CARDS.organiser.eyebrow);
    fireEvent.click(screen.getByRole('button', { name: 'Previous partner option' }));
    expect(activeEyebrow()).toBe(PARTNER_CARDS.venue.eyebrow);
  });

  it('follows a swipe', () => {
    render(<PartnerCarousel />);
    const region = screen.getByRole('region', { hidden: true, name: 'Partner with Curatix' });
    fireEvent.touchStart(region, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(region, { changedTouches: [{ clientX: 100 }] });
    expect(activeEyebrow()).toBe(PARTNER_CARDS.venue.eyebrow);
  });
});
