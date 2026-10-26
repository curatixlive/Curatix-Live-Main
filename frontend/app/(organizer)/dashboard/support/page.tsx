import * as React from 'react';
import type { Metadata } from 'next';
import { OrganizerSupport } from '@/components/support/organizer-support';

export const metadata: Metadata = { title: 'Support' };

/**
 * Two directions: queries customers raised about YOUR events (scoped by the
 * server — see `SupportRepository.list_for_organizations`), and your own queries
 * to the Curatix team.
 */
export default function OrganizerSupportPage() {
  return (
    <div className="flex flex-col gap-block-lg">
      <header className="flex flex-col gap-1">
        <h1 className="text-h3 md:text-h2">Support</h1>
        <p className="text-body-sm text-muted-foreground">
          Answer your customers, or get help from the Curatix team.
        </p>
      </header>
      <OrganizerSupport />
    </div>
  );
}
