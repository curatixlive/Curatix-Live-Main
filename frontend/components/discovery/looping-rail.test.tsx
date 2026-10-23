import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoopingRail, type RailItem } from './looping-rail';

const items = (n: number): RailItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    node: <a href={`/events/${i}`}>Event {i}</a>,
  }));

const order = () => Array.from(document.querySelectorAll('li a')).map((a) => a.textContent);

/** jsdom has no layout: give the rail a width that overflows, and cards a width. */
function layout({
  scrollWidth,
  clientWidth,
  scrollLeft = 0,
  card = 200,
}: {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft?: number;
  card?: number;
}) {
  const ul = document.querySelector('ul') as HTMLUListElement;
  Object.defineProperty(ul, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(ul, 'clientWidth', { configurable: true, value: clientWidth });
  ul.scrollLeft = scrollLeft;
  ul.scrollBy = vi.fn() as unknown as typeof ul.scrollBy;
  for (const li of Array.from(ul.children))
    Object.defineProperty(li, 'offsetWidth', { configurable: true, value: card });
  return ul;
}

const original = window.matchMedia;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // ResizeObserver from setup is a no-op; the rail measures once on mount, so tell
  // it the layout BEFORE mount via the prototype.
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.matchMedia = original;
});

function mountOverflowing(n = 6, props: Partial<React.ComponentProps<typeof LoopingRail>> = {}) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get: () => 1400,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 800,
  });
  const view = render(<LoopingRail label="Featured events" items={items(n)} {...props} />);
  return view;
}
afterEach(() => {
  // @ts-expect-error -- remove the prototype overrides installed by the helper
  delete HTMLElement.prototype.scrollWidth;
  // @ts-expect-error -- same override
  delete HTMLElement.prototype.clientWidth;
});

describe('LoopingRail', () => {
  it('renders every card exactly once — no clones, so no duplicate links', () => {
    mountOverflowing(6);
    expect(order()).toEqual(['Event 0', 'Event 1', 'Event 2', 'Event 3', 'Event 4', 'Event 5']);
    expect(screen.getAllByRole('link')).toHaveLength(6);
  });

  it('renders nothing for zero cards', () => {
    const { container } = render(<LoopingRail label="Featured events" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a single card plainly: no arrows, no pause button', () => {
    render(<LoopingRail label="Featured events" items={items(1)} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows no controls when everything already fits', () => {
    // jsdom's default 0/0 layout: nothing overflows.
    render(<LoopingRail label="Featured events" items={items(3)} />);
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /scrolling/ })).toBeNull();
  });

  it('offers arrows and a real pause button when there is more than fits', () => {
    mountOverflowing(6);
    expect(screen.getByRole('button', { name: 'Next Featured events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous Featured events' })).toBeInTheDocument();
    const pause = screen.getByRole('button', { name: /Pause scrolling/ });
    fireEvent.click(pause);
    expect(screen.getByRole('button', { name: /Resume scrolling/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('glides one card forward from the middle, and rotates only at the end', () => {
    mountOverflowing(6);
    const ul = layout({ scrollWidth: 1400, clientWidth: 800, scrollLeft: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Next Featured events' }));
    expect(ul.scrollBy).toHaveBeenCalledTimes(1);
    expect(order()[0]).toBe('Event 0'); // not at the end yet: no rotation

    ul.scrollLeft = 600; // the end (1400 - 800)
    fireEvent.click(screen.getByRole('button', { name: 'Next Featured events' }));
    expect(order()).toEqual(['Event 1', 'Event 2', 'Event 3', 'Event 4', 'Event 5', 'Event 0']);
    expect(order().sort()).toEqual([
      'Event 0',
      'Event 1',
      'Event 2',
      'Event 3',
      'Event 4',
      'Event 5',
    ]);
  });

  it('rotates backwards from the start so Previous also loops', () => {
    mountOverflowing(6);
    layout({ scrollWidth: 1400, clientWidth: 800, scrollLeft: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Previous Featured events' }));
    expect(order()[0]).toBe('Event 5');
    expect(screen.getAllByRole('link')).toHaveLength(6);
  });

  it('advances by itself every interval while nothing is stopping it', () => {
    mountOverflowing(6, { intervalSeconds: 3 });
    const ul = layout({ scrollWidth: 1400, clientWidth: 800 });
    act(() => void vi.advanceTimersByTime(3100));
    expect(ul.scrollBy).toHaveBeenCalled();
  });

  it('does not run a timer when autoscroll is off', () => {
    mountOverflowing(6, { autoscroll: false, intervalSeconds: 2 });
    const ul = layout({ scrollWidth: 1400, clientWidth: 800 });
    act(() => void vi.advanceTimersByTime(10_000));
    expect(ul.scrollBy).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /scrolling/ })).toBeNull(); // nothing to pause
  });

  it('stops while the pointer is over it, and while a pause is pressed', () => {
    mountOverflowing(6, { intervalSeconds: 2 });
    const ul = layout({ scrollWidth: 1400, clientWidth: 800 });
    fireEvent.pointerEnter(ul.parentElement!);
    act(() => void vi.advanceTimersByTime(6000));
    expect(ul.scrollBy).not.toHaveBeenCalled();
    fireEvent.pointerLeave(ul.parentElement!);
    fireEvent.click(screen.getByRole('button', { name: /Pause scrolling/ }));
    act(() => void vi.advanceTimersByTime(6000));
    expect(ul.scrollBy).not.toHaveBeenCalled();
  });

  it('stops for a few seconds after somebody touches it, then resumes', () => {
    mountOverflowing(6, { intervalSeconds: 2 });
    const ul = layout({ scrollWidth: 1400, clientWidth: 800 });
    fireEvent.pointerDown(ul);
    act(() => void vi.advanceTimersByTime(5000));
    expect(ul.scrollBy).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1500)); // past the 6s hand-over; the effect restarts
    act(() => void vi.advanceTimersByTime(2500));
    expect(ul.scrollBy).toHaveBeenCalled();
  });

  it('never moves on its own under reduced motion (arrows still work, instantly)', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    mountOverflowing(6, { intervalSeconds: 2 });
    const ul = layout({ scrollWidth: 1400, clientWidth: 800 });
    act(() => void vi.advanceTimersByTime(10_000));
    expect(ul.scrollBy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Next Featured events' }));
    expect(ul.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });

  it('starts over from a refreshed list of cards', () => {
    const { rerender } = mountOverflowing(4);
    rerender(<LoopingRail label="Featured events" items={items(5)} />);
    expect(order()).toEqual(['Event 0', 'Event 1', 'Event 2', 'Event 3', 'Event 4']);
  });
});
