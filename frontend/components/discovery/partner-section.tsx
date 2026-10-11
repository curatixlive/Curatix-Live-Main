import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Handshake, Megaphone, Mic2, Ticket } from 'lucide-react';
import { Reveal } from '@/components/discovery/reveal';
import { Container } from '@/components/shell/container';
import { BRAND_NAME } from '@/lib/brand';

/**
 * "Partner with us" — the supply side of the ecosystem, on the landing page.
 *
 * Every card here goes to a route that EXISTS and does the thing it names:
 *
 *   Organisers  → /organizer      (what hosting costs, how payouts work)
 *   Performers  → /studio/new     (list an act for the Hire-a-Band marketplace)
 *   Brands &    → /contact        (a mailto: — there is no partnership form or
 *   venues                          inbox, and a form that drops its message is
 *                                   the worst thing to fake on this site)
 *
 * Venue/restaurant listings and sponsored placements have NO product behind
 * them today, so they are not offered as their own cards. They ride on the
 * brands-and-venues enquiry rather than promising a workflow that is not there.
 *
 * The treatment is deliberately editorial — one dark panel with a heading on the
 * left and the three routes as a list on the right — so it reads as an invitation
 * rather than a fourth rail of cards, and stays distinct from the Hire-a-Band band
 * above it. It is `bg-ink`-based in BOTH themes: an object, not a page surface.
 */

const PARTNERS = [
  {
    href: '/organizer',
    icon: Ticket,
    title: 'Host your event',
    body: 'Sell tickets, run the door and get paid after the show.',
  },
  {
    href: '/studio/new',
    icon: Mic2,
    title: 'List your act',
    body: 'Bands, DJs and performers get briefs from people planning events.',
  },
  {
    href: '/contact',
    icon: Megaphone,
    title: 'Brands and venues',
    body: 'Sponsorships, venue tie-ups and promotional enquiries.',
  },
] as const;

export function PartnerSection() {
  return (
    <section aria-labelledby="partner-heading" className="py-section lg:py-section-lg">
      <Container>
        <Reveal>
          <div className="grid gap-8 overflow-hidden rounded-3xl bg-ink-900 p-6 text-white sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:p-14">
            <div className="flex flex-col justify-center gap-4">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/80">
                <Handshake className="size-3.5" aria-hidden />
                Partner with us
              </span>
              <h2
                id="partner-heading"
                className="text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl"
              >
                Build the night out with {BRAND_NAME}
              </h2>
              <p className="max-w-md text-sm text-white/75 sm:text-base">
                Whether you run the event, play at it, or want your brand in the room, there is a
                place for you here.
              </p>
            </div>

            <ul className="flex flex-col gap-3">
              {PARTNERS.map(({ href, icon: Icon, title, body }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex min-h-[4.5rem] items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-4 transition duration-base hover:border-white/35 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-base font-semibold">{title}</span>
                      <span className="text-sm text-white/70">{body}</span>
                    </span>
                    <ArrowUpRight
                      className="size-5 shrink-0 text-white/60 transition-transform duration-base group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
