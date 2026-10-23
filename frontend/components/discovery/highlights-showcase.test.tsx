import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HomepageHighlight } from '@/lib/api/cms';
import { HighlightsShowcase } from './highlights-showcase';

const item = (over: Partial<HomepageHighlight['video']> = {}): HomepageHighlight => ({
  id: 'h1',
  position: 0,
  event: {
    id: 'e1',
    slug: 'disco-dandiya',
    title: 'Disco Dandiya Night',
    venue: 'Rooftop 21',
    city: 'Bengaluru',
    starts_at: '2026-10-11T14:30:00Z',
    poster_url: '',
  },
  video: {
    embed_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    is_vertical: false,
    caption: '',
    ...over,
  },
});

describe('HighlightsShowcase', () => {
  it('shows an intentional invitation, not a broken reel, when nothing is curated', () => {
    render(<HighlightsShowcase highlights={[]} />);
    expect(screen.getByRole('heading', { name: 'Relive the highlights' })).toBeInTheDocument();
    expect(screen.getByText(/Highlights from our events will play here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Host an event' })).toHaveAttribute(
      'href',
      '/organizer',
    );
  });

  it('loads no player until somebody presses play', () => {
    const { container } = render(<HighlightsShowcase highlights={[item()]} />);
    expect(screen.getByText('Disco Dandiya Night')).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('opens the player with the rebuilt embed URL on press, and destroys it on close', () => {
    render(<HighlightsShowcase highlights={[item()]} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Play highlights from Disco Dandiya Night/ }),
    );
    const frame = document.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&playsinline=1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('drops a highlight whose embed URL is not one we will frame', () => {
    render(
      <HighlightsShowcase
        highlights={[item({ embed_url: 'https://evil.example.com/embed/abcdefghijk' })]}
      />,
    );
    expect(screen.queryByText('Disco Dandiya Night')).toBeNull();
    expect(screen.getByText(/Highlights from our events will play here/)).toBeInTheDocument();
  });
});
