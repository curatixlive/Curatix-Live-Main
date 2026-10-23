'use client';

import * as React from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  /** `origin` is where the reveal grows from (viewport px); omitted = screen centre. */
  toggle: (origin?: { x: number; y: number }) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'ee-theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

/**
 * Token-driven theming: the whole app reskins by toggling the `.dark` class on
 * <html>, which swaps the semantic CSS variables. Defaults to the SYSTEM
 * preference, persists an explicit choice, and reacts live to OS changes while
 * on "system".
 */
export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>('light');

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setThemeState(stored);
    }
  }, []);

  React.useEffect(() => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    setResolvedTheme(resolved);
    apply(resolved);

    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = getSystemTheme();
      setResolvedTheme(next);
      apply(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const toggle = React.useCallback(
    (origin?: { x: number; y: number }) => {
      const next: ResolvedTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
      const root = document.documentElement;
      const commit = () => {
        // flushSync so React's state and the DOM class change inside the same
        // snapshot the browser captures — otherwise the "new" frame is the old theme.
        flushSync(() => setTheme(next));
        apply(next);
      };
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const start = (
        document as Document & {
          startViewTransition?: (cb: () => void) => { finished: Promise<void> };
        }
      ).startViewTransition;
      if (reduced) return commit();

      if (typeof start === 'function') {
        const x = origin?.x ?? window.innerWidth / 2;
        const y = origin?.y ?? window.innerHeight / 2;
        // Radius to the farthest corner, so the circle always covers the page.
        const radius = Math.hypot(
          Math.max(x, window.innerWidth - x),
          Math.max(y, window.innerHeight - y),
        );
        root.style.setProperty('--theme-x', `${x}px`);
        root.style.setProperty('--theme-y', `${y}px`);
        root.style.setProperty('--theme-r', `${radius}px`);
        root.dataset.themeTransition = 'reveal';
        const run = start.call(document, commit);
        const done = () => {
          delete root.dataset.themeTransition;
        };
        run.finished.then(done, done);
        return;
      }

      // No View Transitions (older Firefox/Safari): a short colour cross-fade.
      root.dataset.themeTransition = 'fade';
      commit();
      window.setTimeout(() => delete root.dataset.themeTransition, 400);
    },
    [resolvedTheme, setTheme],
  );

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, toggle }),
    [theme, resolvedTheme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

/**
 * Render-blocking init script (injected in <head>) that sets the theme class
 * BEFORE hydration, so there's no flash of the wrong theme on first paint.
 */
export const themeInitScript = `(function(){try{var k='${STORAGE_KEY}';var s=localStorage.getItem(k)||'system';var d=s==='dark'||(s==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
