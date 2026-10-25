'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  needsBackwardRotation,
  needsForwardRotation,
  rotateOrder,
  sameIds,
} from '@/lib/discovery/rail-order';
import { cn } from '@/lib/utils/cn';

/**
 * A card rail that scrolls itself in a seamless loop.
 *
 * ── HOW IT LOOPS WITHOUT CLONING ─────────────────────────────────────────────
 *
 * See `lib/discovery/rail-order.ts`. One copy of every card, rotated at the end of
 * the scroll with the scroll position corrected in the same frame, so there are no
 * duplicate links, tab stops or screen-reader entries — and no visible jump.
 *
 * ── WHEN IT MOVES, AND WHEN IT DOES NOT ──────────────────────────────────────
 *
 * It advances one card every `intervalSeconds`, only while ALL of these hold:
 * the admin has autoscroll on, there are more cards than fit (otherwise there is
 * nothing to loop), the pointer is not over it, focus is not inside it, nobody
 * has scrolled, swiped or pressed it in the last six seconds, it is on screen,
 * the tab is visible, nobody pressed the pause button, and the viewer has not
 * asked for reduced motion. A rail that is off-screen or hidden by an admin runs
 * no timer at all.
 *
 * Fewer cards than fit — one, two, three — are simply shown: no arrows, no pause
 * button, no broken or empty slots.
 *
 * Auto-moving content needs a stop (WCAG 2.2.2): the pause button below the rail
 * is real, and so is every implicit stop above.
 */

export type RailItem = { id: string; node: React.ReactNode };

const RESUME_AFTER_INTERACTION_MS = 6000;

export function LoopingRail({
  label,
  items,
  autoscroll = true,
  intervalSeconds = 4,
  itemClassName,
  className,
}: {
  label: string;
  items: RailItem[];
  autoscroll?: boolean;
  intervalSeconds?: number;
  /** Width classes for one card — set by the caller, who knows the card. */
  itemClassName?: string;
  className?: string;
}) {
  const ids = React.useMemo(() => items.map((item) => item.id), [items]);
  const [order, setOrder] = React.useState<string[]>(ids);
  const byId = React.useMemo(() => new Map(items.map((item) => [item.id, item.node])), [items]);

  // If the set of cards changes (a refetch), start from the new list.
  React.useEffect(() => {
    setOrder((current) => (sameIds(current, ids) ? current : ids));
  }, [ids]);

  const ref = React.useRef<HTMLUListElement>(null);
  const [canLoop, setCanLoop] = React.useState(false);
  const [engaged, setEngaged] = React.useState(false);
  const [recent, setRecent] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const [tabHidden, setTabHidden] = React.useState(false);
  const [reduced, setReduced] = React.useState(false);

  const programmatic = React.useRef(false);
  const shift = React.useRef(0);
  const followUp = React.useRef(0);
  const recentTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    const onChange = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // Is there more than fits? Re-measured on resize, because a rotated phone can
  // flip it.
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setCanLoop(items.length > 1 && node.scrollWidth > node.clientWidth + 8);
    measure();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [items.length]);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      {
        threshold: 0.2,
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => () => window.clearTimeout(recentTimer.current), []);

  const stride = React.useCallback(() => {
    const node = ref.current;
    const first = node?.firstElementChild as HTMLElement | null;
    if (!node || !first) return 0;
    const gap = Number.parseFloat(getComputedStyle(node).columnGap) || 0;
    return first.offsetWidth + gap;
  }, []);

  const glide = React.useCallback(
    (delta: number) => {
      const node = ref.current;
      if (!node || delta === 0) return;
      programmatic.current = true;
      node.scrollBy({ left: delta, behavior: reduced ? 'auto' : 'smooth' });
      window.setTimeout(
        () => {
          programmatic.current = false;
        },
        reduced ? 60 : 800,
      );
    },
    [reduced],
  );

  // After a rotation: correct the scroll position BEFORE the browser paints, so
  // the view does not move, then continue the glide the rotation made room for.
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node || shift.current === 0) return;
    const correction = shift.current;
    const next = followUp.current;
    shift.current = 0;
    followUp.current = 0;
    node.style.scrollSnapType = 'none';
    node.scrollLeft += correction;
    window.requestAnimationFrame(() => {
      node.style.scrollSnapType = '';
      glide(next);
    });
  }, [order, glide]);

  // The card nearest the middle of the rail comes forward: full size, with its
  // neighbours a little smaller, easing as the rail moves. SCALE only, never
  // opacity: dimming a neighbour dims its title and venue too, and at 60% the
  // venue line fell to 3.5:1 against the page — text a reader can still see
  // and must still be able to read. Written straight to the nodes from the scroll handler (one
  // requestAnimationFrame per frame), so a scroll costs no React render.
  const frame = React.useRef(0);
  const applyFocus = React.useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const view = node.getBoundingClientRect();
    const half = view.width / 2 || 1;
    const centre = view.left + half;
    for (const el of Array.from(node.children) as HTMLElement[]) {
      const box = el.getBoundingClientRect();
      const d = Math.min(Math.abs(box.left + box.width / 2 - centre) / half, 1);
      el.style.transform = `scale(${(1 - 0.1 * d).toFixed(3)})`;
      el.style.zIndex = d < 0.3 ? '1' : '0';
    }
  }, []);
  const queueFocus = React.useCallback(() => {
    window.cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(applyFocus);
  }, [applyFocus]);
  React.useLayoutEffect(() => {
    applyFocus();
    window.addEventListener('resize', queueFocus);
    return () => {
      window.removeEventListener('resize', queueFocus);
      window.cancelAnimationFrame(frame.current);
    };
  }, [order, applyFocus, queueFocus]);

  const advance = React.useCallback(
    (direction: 1 | -1) => {
      const node = ref.current;
      const width = stride();
      if (!node || width === 0) return;
      if (direction === 1) {
        if (needsForwardRotation(node.scrollLeft, node.scrollWidth, node.clientWidth)) {
          shift.current = -width;
          followUp.current = width;
          setOrder((current) => rotateOrder(current, 1));
        } else {
          glide(width);
        }
      } else if (needsBackwardRotation(node.scrollLeft)) {
        shift.current = width;
        followUp.current = -width;
        setOrder((current) => rotateOrder(current, -1));
      } else {
        glide(-width);
      }
    },
    [glide, stride],
  );

  const running = autoscroll && canLoop && !engaged && !recent && visible && !tabHidden && !reduced;

  React.useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => advance(1), Math.max(1, intervalSeconds) * 1000);
    return () => window.clearInterval(id);
  }, [running, advance, intervalSeconds]);

  // Anything the viewer does by hand hands control to them for a while.
  const noteInteraction = () => {
    setRecent(true);
    window.clearTimeout(recentTimer.current);
    recentTimer.current = window.setTimeout(() => setRecent(false), RESUME_AFTER_INTERACTION_MS);
  };

  if (items.length === 0) return null;
  const showControls = canLoop;

  return (
    <div
      className={cn('relative', className)}
      onPointerEnter={() => setEngaged(true)}
      onPointerLeave={() => setEngaged(false)}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={() => setEngaged(false)}
    >
      <ul
        ref={ref}
        aria-label={label}
        onPointerDown={noteInteraction}
        onWheel={noteInteraction}
        onKeyDown={noteInteraction}
        onScroll={() => {
          queueFocus();
          if (!programmatic.current) noteInteraction();
        }}
        className="scrollbar-none -mx-4 flex touch-manipulation snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:scroll-px-0 lg:gap-6 lg:px-0"
      >
        {order.map((id) => (
          <li key={id} className={cn('shrink-0 snap-start will-change-transform', itemClassName)}>
            {byId.get(id)}
          </li>
        ))}
      </ul>

      {showControls ? (
        <>
          <ArrowButton
            side="left"
            label={`Previous ${label}`}
            onClick={() => {
              noteInteraction();
              advance(-1);
            }}
          />
          <ArrowButton
            side="right"
            label={`Next ${label}`}
            onClick={() => {
              noteInteraction();
              advance(1);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function ArrowButton({
  side,
  label,
  onClick,
}: {
  side: 'left' | 'right';
  label: string;
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'absolute top-[38%] z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-md transition md:flex',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        side === 'left' ? '-left-3 lg:-left-5' : '-right-3 lg:-right-5',
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
