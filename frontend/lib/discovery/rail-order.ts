/**
 * The arithmetic behind a looping rail that has NO cloned cards.
 *
 * A "seamless" loop is usually built by rendering the list twice and jumping the
 * scroll position back when the copy is reached. That leaves duplicate links in
 * the page — two tab stops and two screen-reader entries for every event — which
 * is exactly the accessibility problem to avoid.
 *
 * This loop instead keeps ONE copy of each card and ROTATES the list: when the
 * rail has scrolled to its end, the first card is moved to the back and the scroll
 * position is corrected by that card's width in the same frame, so the view does
 * not move — and there is room to keep scrolling forward onto what used to be the
 * first card. Backwards is the mirror image. Every card exists exactly once, and
 * stays a real, clickable, focusable link wherever it is in the loop.
 */

/** Move the first id to the back (direction 1) or the last to the front (-1). */
export function rotateOrder<T>(order: readonly T[], direction: 1 | -1): T[] {
  if (order.length < 2) return [...order];
  return direction === 1
    ? [...order.slice(1), order[0] as T]
    : [order[order.length - 1] as T, ...order.slice(0, -1)];
}

/** Whether two id lists contain the same ids, regardless of order. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * Does moving forward need a rotation first? True when the rail is already at its
 * end (within a few pixels), where there is nothing left to scroll onto.
 */
export function needsForwardRotation(scrollLeft: number, scrollWidth: number, clientWidth: number) {
  return scrollLeft >= scrollWidth - clientWidth - 4;
}

/** Does moving backward need a rotation first? True at the very start. */
export function needsBackwardRotation(scrollLeft: number) {
  return scrollLeft <= 4;
}
