import * as React from 'react';
import type { Metadata } from 'next';
import { Megaphone, Target, Ticket, Users } from 'lucide-react';
import { SpotTicket } from '@/components/illustrations/spots';
import {
  CtaBand,
  FeatureGrid,
  PageHeader,
  Prose,
  StaticPage,
  Steps,
} from '@/components/pages/page-shell';
import { BRAND_NAME } from '@/lib/brand';
import { enquiryHref } from '@/lib/discovery/partner-cards';
import { pageMetadata } from '@/lib/seo/metadata';

/**
 * ── BECOME AN EVENT SPONSOR ───────────────────────────────────────────────
 *
 * Reached from the homepage partner carousel. There is no sponsorship product —
 * no placements, no inventory, no reporting — so this page describes a
 * conversation, not a self-serve purchase, and states plainly what is not built.
 * It makes no claim about audience size, reach or results: the platform
 * measures none of them for a sponsor, and quoting a figure here would be the
 * kind of invented number this codebase refuses everywhere else.
 */

export const metadata: Metadata = {
  ...pageMetadata(
    'Become an event sponsor',
    `Sponsor events on ${BRAND_NAME}. Talk to us about backing the shows, festivals and series that fit your brand.`,
  ),
  alternates: { canonical: '/sponsors' },
};

const FEATURES = [
  {
    icon: <Target className="size-5" aria-hidden />,
    title: 'Match the brand to the room',
    body: 'Tell us who you want to reach and we will point you at events that gather them.',
  },
  {
    icon: <Ticket className="size-5" aria-hidden />,
    title: 'Shows, festivals and series',
    body: 'Back a single night, a recurring series or a whole festival, depending on what suits you.',
  },
  {
    icon: <Users className="size-5" aria-hidden />,
    title: 'Organisers on board',
    body: 'We speak to the organiser first, so a sponsorship is something they want, not something imposed on their event.',
  },
  {
    icon: <Megaphone className="size-5" aria-hidden />,
    title: 'Agreed up front',
    body: 'What you get, where your name appears and what it costs are settled in writing before anything is announced.',
  },
];

export default function SponsorsPage() {
  return (
    <StaticPage>
      <PageHeader
        eyebrow="For brands"
        title="Be part of the night, not just near it."
        lead="Sponsor the events your customers already love. Tell us about your brand and who you want to reach, and we will talk through what could work."
        illustration={<SpotTicket />}
      />

      <FeatureGrid features={FEATURES} />

      <div className="flex flex-col gap-4">
        <h2 className="text-h3">How it works</h2>
        <Steps
          steps={[
            {
              title: 'Tell us about your brand',
              body: 'Who you are, who you want to reach, the cities you care about and a rough budget.',
            },
            {
              title: 'We suggest events',
              body: 'We come back with events and organisers that fit, and what a sponsorship could look like.',
            },
            {
              title: 'Agree it with the organiser',
              body: 'Terms are agreed with the organiser before anything goes live.',
            },
          ]}
        />
      </div>

      <Prose>
        <p>
          There is no sponsor dashboard, ad placement tool or audience reporting yet. Sponsorships
          are arranged personally, and we will be clear about what we can and cannot measure for
          you.
        </p>
      </Prose>

      <CtaBand
        title="Start the conversation"
        body="A short email about your brand is enough to begin."
        primary={{ href: enquiryHref('Event sponsorship enquiry'), label: 'Email us' }}
        secondary={{ href: '/organizer', label: 'I run events instead' }}
      />
    </StaticPage>
  );
}
