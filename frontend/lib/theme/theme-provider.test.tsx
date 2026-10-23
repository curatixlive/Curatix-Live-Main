import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './theme-provider';

function Probe() {
  const { resolvedTheme, toggle } = useTheme();
  return (
    <button type="button" onClick={() => toggle()}>
      theme:{resolvedTheme}
    </button>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('toggles the dark class on <html> and persists the choice', async () => {
    render(
      <ThemeProvider defaultTheme="light">
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await userEvent.click(screen.getByRole('button'));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('ee-theme')).toBe('dark');
  });
});

describe('theme change transition', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });
  const press = () => {
    render(
      <ThemeProvider defaultTheme="light">
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button'));
  };
  const motion = (reduce: boolean) =>
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: reduce && q.includes('reduce'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as { startViewTransition?: unknown }).startViewTransition;
  });

  it('uses the view-transition reveal when supported', () => {
    motion(false);
    const start = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    (document as unknown as { startViewTransition: typeof start }).startViewTransition = start;
    press();
    expect(start).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('switches instantly, with no transition, under reduced motion', () => {
    motion(true);
    const start = vi.fn();
    (document as unknown as { startViewTransition: typeof start }).startViewTransition = start;
    press();
    expect(start).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('still switches where view transitions do not exist', () => {
    motion(false);
    press();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
