import * as React from 'react';
import type { Metadata } from 'next';
import { Building2, CalendarClock, Handshake, Users } from 'lucide-react';
import { SpotCity } from '@/components/illustrations/spots';
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
 * ── BECOME A VENUE PARTNER ────────────────────────────────────────────────
 *
 * The homepage's partner carousel points here. There is NO self-serve venue
 * listing product yet — no venue model, no venue pages, no booking of a space —
 * so this page does not pretend there is one. It says what a venue partnership
 * means today (a conversation with a person), what to send, and what happens
 * next, and its button opens a prefilled email. When venue listings ship this
 * page grows the form, and the form will have a real inbox behind it.
 *
 * Nothing here claims a number of venues, organisers or events: there is no
 * measurement behind any of them.
 */

export const metadata: Metadata = {
  ...pageMetadata(
    'Become a venue partner',
    `Host events booked through ${BRAND_NAME}. Tell us about your venue and we will introduce you to organisers looking for the right space.`,
  ),
  alternates: { canonical: '/venue-partners' },
};

const FEATURES = [
  {
    icon: <Building2 className="size-5" aria-hidden />,
    title: 'Clubs, halls, rooftops and restaurants',
    body: 'If you have a space that suits live events, concerts, comedy, workshops or festivals, we want to hear about it.',
  },
  {
    icon: <Users className="size-5" aria-hidden />,
    title: 'Introduced to organisers',
    body: 'Organisers on the platform are always looking for a home for their next event. We make the introduction.',
  },
  {
    icon: <CalendarClock className="size-5" aria-hidden />,
    title: 'Your calendar, your rules',
    body: 'You decide which nights and which kinds of events suit the space. Nothing is booked without you agreeing.',
  },
  {
    icon: <Handshake className="size-5" aria-hidden />,
    title: 'A person, not a form',
    body: `Venue partnerships are handled personally while self-serve listings are built, so you talk to someone at ${BRAND_NAME} from the start.`,
  },
];

export default function VenuePartnersPage() {
  return (
    <StaticPage>
      <PageHeader
        eyebrow="For venues"
        title="Give great events a home."
        lead={`Tell us about your venue and the nights it suits. We will introduce you to organisers who are looking for exactly that kind of space.`}
        illustration={<SpotCity />}
      />

      <FeatureGrid features={FEATURES} />

      <div className="flex flex-col gap-4">
        <h2 className="text-h3">How it works</h2>
        <Steps
          steps={[
            {
              title: 'Send us the basics',
              body: 'Your venue name, city, capacity, the kinds of events it suits, and the best way to reach you.',
            },
            {
              title: 'We get in touch',
              body: 'We will talk through how you like to work with organisers: nights, hire terms and anything the space cannot do.',
            },
            {
              title: 'We make introductions',
              body: 'When an organiser needs a space like yours, we put you in touch directly.',
            },
          ]}
        />
      </div>

      <Prose>
        <p>
          Self-serve venue pages, availability calendars and online space booking are not available
          yet. If you need those today, this is not the right fit; if you would like to be among the
          first venues when they arrive, get in touch now.
        </p>
      </Prose>

      <CtaBand
        title="Tell us about your venue"
        body="One email with the basics is enough to start."
        primary={{ href: enquiryHref('Venue partnership enquiry'), label: 'Email us' }}
        secondary={{ href: '/organizer', label: 'I run events instead' }}
      />
    </StaticPage>
  );
}
