'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, LogOut, Menu, Ticket } from 'lucide-react';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '@/components/ui';
import { useAuth } from '@/lib/auth/auth-provider';
import { ORGANIZER_SECTIONS, isSectionActive } from '@/lib/organizer/nav';
import { cn } from '@/lib/utils/cn';

/**
 * THE PHONE'S WAY TO EVERYTHING THE BOTTOM BAR HAS NO ROOM FOR.
 *
 * Below `lg` the sidebar does not exist and the bottom bar holds five
 * destinations, so Bookings, Customers, Promotions, Payouts, Refunds, Campaigns
 * and the rest were reachable only by finding the sections grid on the
 * dashboard landing — and once on any one of them there was no way to the next
 * without going back first. This is the three-line button that opens the whole
 * list from any screen, and a back button beside it for the screens that are
 * not the landing.
 *
 * It reads `ORGANIZER_SECTIONS`, the same list the sidebar and the ⌘K palette
 * read, so a section added there appears here with no further change.
 */
export function MobileMenu() {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = React.useState(false);

  // A drawer left open over the page you just asked for is the most common
  // mobile-dashboard annoyance: close on any navigation.
  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="inline-flex h-control w-control shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </DrawerTrigger>
      <DrawerContent side="left" bare hideClose aria-describedby={undefined} className="max-w-xs">
        <DrawerTitle className="border-b border-border px-4 py-3">Organizer menu</DrawerTitle>
        <nav aria-label="Dashboard sections" className="flex-1 overflow-y-auto p-2">
          <ul className="flex flex-col gap-0.5">
            {ORGANIZER_SECTIONS.map((section) => {
              const active = isSectionActive(pathname, section.href);
              return (
                <li key={section.href}>
                  <Link
                    href={section.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-control items-center gap-3 rounded-full px-3 text-label transition-colors duration-fast',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-nav-active text-nav-active-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <section.icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{section.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <MenuFooter />
      </DrawerContent>
    </Drawer>
  );
}

function MenuFooter() {
  const { signOut } = useAuth();
  const router = useRouter();
  const row =
    'flex h-control w-full items-center gap-3 rounded-full px-3 text-left text-label text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-t border-border p-2">
      <Link href="/" className={row}>
        <Ticket className="size-4 shrink-0" aria-hidden />
        Attendee site
      </Link>
      <button
        type="button"
        onClick={() => void signOut().then(() => router.push('/'))}
        className={row}
      >
        <LogOut className="size-4 shrink-0" aria-hidden />
        Sign out
      </button>
      <div className="px-1 pt-1">
        <ThemeToggle />
      </div>
    </div>
  );
}

/**
 * A way back, on every dashboard screen except the landing.
 *
 * `router.back()` when there is somewhere to go back to (the screen the
 * organizer actually came from), otherwise up to the dashboard: arriving on a
 * deep link or after a refresh leaves no history, and a back button that does
 * nothing is worse than none.
 */
export function BackButton() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  if (pathname === '/dashboard') return null;
  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back();
        else router.push('/dashboard');
      }}
      className="inline-flex h-control w-control shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
    >
      <ArrowLeft className="size-5" aria-hidden />
    </button>
  );
}
