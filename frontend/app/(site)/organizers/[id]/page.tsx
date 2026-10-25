import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Star } from 'lucide-react';
import { FollowButton } from '@/components/community/follow-button';
import { EventGrid } from '@/components/discovery/event-grid';
import { Container } from '@/components/shell/container';
import { fetchCommunity, type Community } from '@/lib/api/community';
import { isApiError } from '@/lib/api/errors';
import { pageMetadata } from '@/lib/seo/metadata';

/**
 * An organizer's community page — their portfolio, as a follower sees it.
 *
 * Every section is real or absent: no bio means no About block (never filler),
 * no reviews means the rating row says so rather than "0.0", no past events
 * means no "previous events" heading. The follower count and every rating come
 * from rows the platform holds.
 */
export const revalidate = 60;

async function load(id: string): Promise<Community | null> {
  try {
    return await fetchCommunity(id);
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const data = await load(params.id);
  if (!data) return { title: 'Organiser not found', robots: { index: false } };
  const { organization: org } = data;
  return pageMetadata(
    `${org.name} — events and community`,
    org.bio ? org.bio.slice(0, 160) : `Upcoming and past events from ${org.name}.`,
  );
}

export default async function CommunityPage({ params }: { params: { id: string } }) {
  const data = await load(params.id);
  if (!data) notFound();
  const { organization: org, upcoming_events, past_events, reviews } = data;
  const initials = org.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="flex flex-col gap-section pb-section">
      <div className="relative h-40 w-full overflow-hidden bg-muted sm:h-56">
        {org.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote user media; sized by the frame
          <img src={org.cover_url} alt="" className="size-full object-cover" />
        ) : null}
      </div>

      <Container className="-mt-14 flex flex-col gap-section">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-end gap-4">
            <span
              aria-hidden={Boolean(org.logo_url)}
              className="inline-flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-secondary text-h3 font-semibold text-secondary-foreground"
            >
              {org.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.logo_url} alt="" className="size-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <div className="flex min-w-0 flex-col gap-1 pb-1">
              <h1 className="truncate text-h3 sm:text-h2">{org.name}</h1>
              <p className="text-body-sm text-muted-foreground">
                {org.verified_level === 'verified' ? 'Verified organiser · ' : ''}
                On Curatix since {new Date(org.member_since).getFullYear()}
              </p>
            </div>
          </div>
          <FollowButton
            organizationId={org.id}
            initialCount={org.follower_count}
            returnTo={`/organizers/${org.id}`}
          />
        </header>

        <section aria-label="Ratings" className="flex flex-wrap items-center gap-3">
          {reviews.average === null ? (
            <p className="text-body-sm text-muted-foreground">
              No reviews yet. Reviews appear here after people who attended rate an event.
            </p>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-h4 font-semibold">
                <Star className="size-5 fill-current text-warning" aria-hidden />
                {reviews.average.toFixed(1)}
              </span>
              <span className="text-body-sm text-muted-foreground">
                from {reviews.count} verified {reviews.count === 1 ? 'review' : 'reviews'}
              </span>
            </>
          )}
        </section>

        {org.bio ? (
          <section aria-labelledby="about" className="flex max-w-prose flex-col gap-2">
            <h2 id="about" className="text-h4">
              About
            </h2>
            <p className="whitespace-pre-line text-body text-muted-foreground">{org.bio}</p>
          </section>
        ) : null}

        <section aria-labelledby="upcoming" className="flex flex-col gap-4">
          <h2 id="upcoming" className="text-h4">
            Upcoming events
          </h2>
          {upcoming_events.length ? (
            <EventGrid events={upcoming_events} />
          ) : (
            <p className="text-body-sm text-muted-foreground">
              Nothing on sale right now. Follow {org.name} and you will hear when they announce
              something.
            </p>
          )}
        </section>

        {reviews.latest.length ? (
          <section id="reviews" aria-labelledby="reviews-h" className="flex flex-col gap-4">
            <h2 id="reviews-h" className="text-h4">
              What attendees say
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {reviews.latest.map((review) => (
                <li
                  key={review.id}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-sm font-semibold">{review.reviewer}</span>
                    <span
                      className="inline-flex items-center gap-1 text-body-sm"
                      aria-label={`${review.rating} out of 5`}
                    >
                      <Star className="size-4 fill-current text-warning" aria-hidden />
                      {review.rating}
                    </span>
                  </div>
                  {review.body ? <p className="text-body-sm">{review.body}</p> : null}
                  <p className="text-caption text-muted-foreground">
                    {review.verified_attendee ? 'Verified attendee · ' : 'Ticket holder · '}
                    <Link href={`/events/${review.event_id}`} className="underline">
                      {review.event_title}
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {past_events.length ? (
          <section aria-labelledby="past" className="flex flex-col gap-4">
            <h2 id="past" className="text-h4">
              Previous events
            </h2>
            <EventGrid events={past_events} />
          </section>
        ) : null}
      </Container>
    </div>
  );
}
