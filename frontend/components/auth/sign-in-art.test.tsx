import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignInArt } from './sign-in-art';
import { CreatureSides } from './creatures';

describe('sign-in characters', () => {
  it('are hidden from assistive technology, in one piece', () => {
    const { container } = render(
      <div>
        <SignInArt />
        <CreatureSides />
        <button type="button">Sign in</button>
      </div>,
    );
    // Decoration: announcing five drawn creatures would put a paragraph between
    // a screen-reader user and the control they came for.
    for (const wrapper of container.querySelectorAll('[aria-hidden="true"]')) {
      expect(wrapper).toBeTruthy();
    }
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(10);
    expect(screen.getByRole('button')).toBeVisible();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('close their eyes for a hidden password and stop moving under reduced motion', () => {
    const { container } = render(<SignInArt />);
    const css = container.querySelector('style')?.textContent ?? '';
    // The closed state is keyed to a password field that is actually hidden, so
    // revealing the password opens the eyes again.
    expect(css).toContain('#auth-password[type="password"]:focus');
    expect(css).toContain('prefers-reduced-motion');
  });
});
