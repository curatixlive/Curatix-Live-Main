'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * A horizontal snap-scroll rail with previous/next buttons.
 *
 * It is a REAL scroll container — touch, trackpad, wheel and keyboard scrolling
 * all work natively — and the buttons only call `scrollBy`. Nothing moves on its
 * own, so there is no auto-motion to pause, and a card never slides from under
 * a pointer.
 *
 * The buttons show from `md` (a thumb does not need them) and disable at each
 * end, so they never offer a move that does nothing. Under
 * `prefers-reduced-motion` the jump is instant rather than animated.
 */
export function ScrollRail({
  label,
  children,
  className,
  listClassName,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  listClassName?: string;
}) {
  const ref = React.useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = React.useState(false);
  const [canNext, setCanNext] = React.useState(false);

  const update = React.useCallback(() => {
    const node = ref.current;
    if (!node) return;
    setCanPrev(node.scrollLeft > 4);
    setCanNext(node.scrollLeft + node.clientWidth < node.scrollWidth - 4);
  }, []);

  React.useEffect(() => {
    update();
    const node = ref.current;
    if (!node) return;
    node.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : undefined;
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [update]);

  const move = (direction: 1 | -1) => {
    const node = ref.current;
    if (!node) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollBy({
      left: direction * node.clientWidth * 0.85,
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  return (
    <div className={cn('relative', className)}>
      <ul
        ref={ref}
        aria-label={label}
        className={cn(
          'scrollbar-none -mx-4 flex touch-manipulation snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:scroll-px-0 lg:px-0',
          listClassName,
        )}
      >
        {children}
      </ul>
      <RailButton
        side="left"
        label={`Previous ${label}`}
        disabled={!canPrev}
        onClick={() => move(-1)}
      />
      <RailButton
        side="right"
        label={`Next ${label}`}
        disabled={!canNext}
        onClick={() => move(1)}
      />
    </div>
  );
}

function RailButton({
  side,
  label,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'absolute top-[38%] z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-md transition md:flex',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-0 motion-reduce:transition-none',
        side === 'left' ? '-left-3 lg:-left-5' : '-right-3 lg:-right-5',
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
