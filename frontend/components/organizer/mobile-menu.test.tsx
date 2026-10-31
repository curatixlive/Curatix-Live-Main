import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const back = vi.fn();
let pathname = '/dashboard/bookings';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, back }),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ signOut: () => Promise.resolve() }),
}));
vi.mock('@/components/shell/theme-toggle', () => ({ ThemeToggle: () => null }));

import { ORGANIZER_SECTIONS } from '@/lib/organizer/nav';
import { BackButton, MobileMenu } from './mobile-menu';

describe('MobileMenu', () => {
  it('opens a list of EVERY organizer section from any screen', () => {
    render(<MobileMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const nav = screen.getByRole('navigation', { name: 'Dashboard sections' });
    for (const section of ORGANIZER_SECTIONS) {
      expect(nav.querySelector(`a[href="${section.href}"]`), section.label).not.toBeNull();
    }
  });

  it('marks the section you are on', () => {
    render(<MobileMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('link', { name: 'Bookings' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});

describe('BackButton', () => {
  beforeEach(() => {
    push.mockClear();
    back.mockClear();
    pathname = '/dashboard/bookings';
  });

  it('is absent on the dashboard landing, where there is nowhere up to go', () => {
    pathname = '/dashboard';
    render(<BackButton />);
    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull();
  });

  it('goes back through history when there is some', () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    render(<BackButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('falls up to the dashboard on a deep link with no history', () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    render(<BackButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(push).toHaveBeenCalledWith('/dashboard');
  });
});
