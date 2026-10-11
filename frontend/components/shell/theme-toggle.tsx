'use client';

import { useTheme } from '@/lib/theme/theme-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

/**
 * Light/dark toggle.
 *
 * Both icons always render and CSS picks per theme, so it is hydration-safe
 * with the no-FOUC init script — the server cannot know the theme, and a
 * toggle that renders the wrong glyph for a frame is the one control where
 * that is immediately obvious.
 *
 * ── THE SCENE ─────────────────────────────────────────────────────────────
 *
 * A small sky in a circle. Going to dark, the SUN DIPS BELOW THE HORIZON while
 * the sky deepens to night, the MOON RISES in its place and a few STARS fade
 * in; going to light, the same in reverse. It is pure CSS — `transform`,
 * `opacity` and one background colour, keyed off the `dark` class on <html> —
 * so it is hydration-safe (the server cannot know the theme, and a CSS
 * selector needs no JS to be right on first paint), costs no animation library,
 * and cannot fire on arrival: a transition needs a previous computed value to
 * move from, and on first paint there isn't one.
 *
 * 600ms, ease-in-out, and every part is `motion-reduce:transition-none`, so a
 * viewer who asked for less motion gets the end state at once. Rapid repeated
 * presses just retarget the running transitions; nothing queues, and nothing
 * here delays a navigation or a booking action.
 *
 * ── TWO THINGS HERE ARE LOAD-BEARING ──────────────────────────────────────
 *
 * 1. The aria-label FORMULA. Three e2e tests click this control by the name
 *    `/switch to dark theme/i`; rewording it breaks them silently.
 * 2. The 44px box. It inherits `Button` `size="icon"` (h-11 w-11) and only
 *    overrides the radius — if that variant ever shrinks, this bar's action
 *    row drops below the touch-target floor, and so do the admin console's and
 *    the organizer dashboard's, which render this same component.
 *
 * The quiet neutral treatment (ink glyph, muted hover fill, no brand tint) is
 * `Button`'s `ghost` variant unmodified, which is exactly right for chrome you
 * set once — so there is nothing to restyle here beyond the pill radius.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={cn('rounded-full', className)}
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {/* The scene and its colours live in `styles/tokens.css` (`.theme-scene`):
          fixed illustration colours, not page tokens. */}
      <span className="theme-scene" aria-hidden>
        <span className="theme-scene__star" />
        <span className="theme-scene__star" />
        <span className="theme-scene__star" />
        <span className="theme-scene__sun" />
        <span className="theme-scene__moon" />
        <span className="theme-scene__hill" />
      </span>
    </Button>
  );
}
