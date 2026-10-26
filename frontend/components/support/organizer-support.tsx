'use client';

import * as React from 'react';
import { Headset, Inbox } from 'lucide-react';
import { SupportCentre } from '@/components/support/support-centre';
import { SupportQueue } from '@/components/support/support-queue';
import { cn } from '@/lib/utils/cn';

type Tab = 'customers' | 'curatix';

const TABS: { id: Tab; label: string; hint: string; Icon: typeof Inbox }[] = [
  {
    id: 'customers',
    label: 'From your customers',
    hint: 'Questions about your events',
    Icon: Inbox,
  },
  {
    id: 'curatix',
    label: 'Contact Curatix',
    hint: 'Payouts, payments, your account',
    Icon: Headset,
  },
];

/**
 * Support has two directions, and an organiser needs both:
 *
 * - FROM YOUR CUSTOMERS: queries buyers raised about your events and addressed
 *   to you. You answer them; replies reach the customer by email.
 * - CONTACT CURATIX: you raising a query with the platform team — a payout that
 *   has not arrived, a verification question, a payment problem. It is your own
 *   thread with the Curatix team, separate from your customers' queries.
 */
export function OrganizerSupport() {
  const [tab, setTab] = React.useState<Tab>('customers');
  return (
    <div className="flex flex-col gap-block-lg">
      <div
        role="tablist"
        aria-label="Support"
        className="inline-flex w-full max-w-xl gap-1 rounded-2xl border border-border bg-surface p-1 shadow-sm"
      >
        {TABS.map(({ id, label, hint, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-nav-active text-nav-active-foreground' : 'hover:bg-muted',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-body-sm font-semibold">{label}</span>
                <span
                  className={cn(
                    'block truncate text-caption',
                    active ? 'opacity-80' : 'text-muted-foreground',
                  )}
                >
                  {hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'customers' ? (
        <SupportQueue scope="organizer" />
      ) : (
        <React.Suspense fallback={null}>
          <SupportCentre platformOnly />
        </React.Suspense>
      )}
    </div>
  );
}
