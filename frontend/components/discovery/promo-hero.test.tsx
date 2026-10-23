import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PromoCampaign } from '@/lib/api/cms';
import { PromoHero } from './promo-hero';

const image: PromoCampaign = {
  id: 'a',
  kind: 'image',
  title: 'Navratri Nights',
  description: 'Garba, dhol and a dancefloor.',
  alt_text: 'Dancers in bright costumes',
  media_url: 'https://cdn.example.com/a.jpg',
  cta_label: 'Book now',
  cta_href: '/events?q=navratri',
  position: 1,
};
const video: PromoCampaign = {
  id: 'v',
  kind: 'video',
  title: 'Festival reel',
  alt_text: 'Crowd at a festival',
  media_url: 'https://cdn.example.com/reel.mp4',
  poster_url: 'https://cdn.example.com/reel.jpg',
  position: 0,
};

describe('PromoHero', () => {
  it('renders nothing when there are no campaigns — the page then shows the brand hero', () => {
    const { container } = render(<PromoHero campaigns={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('labels an advertisement as promoted, so it is never mistaken for an event', () => {
    render(<PromoHero campaigns={[image]} />);
    expect(screen.getByText('Promoted')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Navratri Nights' })).toBeInTheDocument();
  });

  it('draws the button only for a safe link', () => {
    const { rerender } = render(<PromoHero campaigns={[image]} />);
    expect(screen.getByRole('link', { name: /Book now/ })).toHaveAttribute(
      'href',
      '/events?q=navratri',
    );
    rerender(<PromoHero campaigns={[{ ...image, cta_href: 'javascript:alert(1)' }]} />);
    expect(screen.queryByRole('link', { name: /Book now/ })).toBeNull();
  });

  it('never shows a campaign outside its window', () => {
    const { container } = render(
      <PromoHero campaigns={[{ ...image, ends_at: '2000-01-01T00:00:00Z' }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('has carousel controls only when there is more than one slide', () => {
    const { rerender } = render(<PromoHero campaigns={[image]} />);
    expect(screen.queryByRole('button', { name: 'Next promotion' })).toBeNull();
    rerender(<PromoHero campaigns={[image, video]} />);
    expect(screen.getByRole('button', { name: 'Next promotion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous promotion' })).toBeInTheDocument();
  });

  it('plays video muted, without the browser control bar, with its own play and mute buttons', () => {
    const { container } = render(<PromoHero campaigns={[video]} />);
    const el = container.querySelector('video');
    expect(el).not.toBeNull();
    expect(el?.hasAttribute('controls')).toBe(false);
    expect(el?.muted).toBe(true);
    expect(el?.loop).toBe(true);
    expect(el).toHaveAttribute('poster', 'https://cdn.example.com/reel.jpg');
    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unmute video' })).toBeInTheDocument();
  });

  it('does not start a video on its own under reduced motion', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      const { container } = render(<PromoHero campaigns={[video]} />);
      expect(container.querySelector('video')).toHaveAttribute('preload', 'none');
    } finally {
      window.matchMedia = original;
    }
  });
});
