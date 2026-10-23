import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomepageHighlight } from '@/lib/api/cms';
import { HighlightsShowcase } from './highlights-showcase';

const item = (
  id: string,
  title: string,
  embed = 'https://www.youtube.com/embed/dQw4w9WgXcQ',
): HomepageHighlight => ({
  id,
  position: 0,
  event: {
    id: `e-${id}`,
    slug: 'disco-dandiya',
    title,
    venue: 'Rooftop 21',
    city: 'Bengaluru',
    starts_at: '2026-10-11T14:30:00Z',
    poster_url: '',
  },
  video: { embed_url: embed, is_vertical: false, caption: '' },
});

/** An IntersectionObserver the test can drive. */
class FakeObserver {
  static all: FakeObserver[] = [];
  constructor(private cb: IntersectionObserverCallback) {
    FakeObserver.all.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  show(ratio: number) {
    this.cb(
      [{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry],
      this as never,
    );
  }
}
const scrollTo = (ratio: number) => act(() => FakeObserver.all.forEach((o) => o.show(ratio)));
const frames = () => Array.from(document.querySelectorAll('iframe'));

function setReducedMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  FakeObserver.all = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  setReducedMotion(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

  it('loads no player until the section has scrolled into view', () => {
    render(<HighlightsShowcase highlights={[item('1', 'Holi Beats')]} />);
    expect(frames()).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: /Play highlights from Holi Beats/ }),
    ).toBeInTheDocument();
  });

  it('starts the visible video muted when the section scrolls into view', () => {
    render(<HighlightsShowcase highlights={[item('1', 'Holi Beats')]} />);
    scrollTo(0.8);
    expect(frames()).toHaveLength(1);
    const query = new URL(frames()[0]!.src).searchParams;
    expect(query.get('autoplay')).toBe('1');
    expect(query.get('mute')).toBe('1');
    expect(query.get('enablejsapi')).toBe('1');
  });

  it('never has more than one player, even with several highlights', () => {
    render(
      <HighlightsShowcase
        highlights={[item('1', 'Holi Beats'), item('2', 'Comedy Cellar'), item('3', 'Marathon 5K')]}
      />,
    );
    scrollTo(0.8);
    expect(frames()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Play highlights from Comedy Cellar/ }));
    expect(frames()).toHaveLength(1); // replaced, not added
    expect(screen.getByRole('heading', { name: 'Comedy Cellar' })).toBeInTheDocument();
  });

  it('pauses when the section leaves the screen and resumes when it comes back — the same frame', () => {
    vi.useFakeTimers();
    render(<HighlightsShowcase highlights={[item('1', 'Holi Beats')]} />);
    scrollTo(0.8);
    const frame = frames()[0]!;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    act(() => void vi.advanceTimersByTime(400));
    expect(post.mock.calls.some(([m]) => String(m).includes('playVideo'))).toBe(true);

    post.mockClear();
    scrollTo(0); // scrolled away
    act(() => void vi.advanceTimersByTime(400));
    expect(post.mock.calls.some(([m]) => String(m).includes('pauseVideo'))).toBe(true);
    expect(frames()).toHaveLength(1); // still there, just paused

    post.mockClear();
    scrollTo(0.8); // back
    act(() => void vi.advanceTimersByTime(400));
    expect(post.mock.calls.some(([m]) => String(m).includes('playVideo'))).toBe(true);
    expect(frames()[0]).toBe(frame); // not a second instance
  });

  it('only sends commands to the origin the frame was built for', () => {
    vi.useFakeTimers();
    render(<HighlightsShowcase highlights={[item('1', 'Holi Beats')]} />);
    scrollTo(0.8);
    const frame = frames()[0]!;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    act(() => void vi.advanceTimersByTime(400));
    expect(post.mock.calls.length).toBeGreaterThan(0);
    for (const call of post.mock.calls) expect(call[1]).toBe('https://www.youtube.com');
  });

  it('does not autoplay when an operator has switched it off — poster and a play button instead', () => {
    render(<HighlightsShowcase highlights={[item('1', 'Holi Beats')]} autoplay={false} />);
    scrollTo(0.8);
    expect(frames()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Play highlights from Holi Beats/ }));
    expect(frames()).toHaveLength(1); // an explicit press is honoured
  });

  it('does not autoplay under reduced motion', () => {
    setReducedMotion(true);
    render(<HighlightsShowcase highlights={[item('1', 'Holi Beats')]} />);
    scrollTo(0.8);
    expect(frames()).toHaveLength(0);
  });

  it('offers a way out when the video never loads', () => {
    vi.useFakeTimers();
    render(<HighlightsShowcase highlights={[item('1', 'Holi Beats')]} />);
    scrollTo(0.8);
    act(() => void vi.advanceTimersByTime(10_500));
    expect(screen.getByRole('link', { name: /Watch on YouTube/ })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('drops a highlight whose embed URL is not one we will frame', () => {
    render(
      <HighlightsShowcase
        highlights={[item('1', 'Holi Beats', 'https://evil.example.com/embed/abcdefghijk')]}
      />,
    );
    scrollTo(0.8);
    expect(frames()).toHaveLength(0);
    expect(screen.queryByText('Holi Beats')).toBeNull();
    expect(screen.getByText(/Highlights from our events will play here/)).toBeInTheDocument();
  });

  it('links the playing highlight to its event', () => {
    render(<HighlightsShowcase highlights={[item('1', 'Holi Beats')]} />);
    expect(screen.getByRole('link', { name: 'About this event' })).toHaveAttribute(
      'href',
      expect.stringContaining('/events/'),
    );
  });
});
