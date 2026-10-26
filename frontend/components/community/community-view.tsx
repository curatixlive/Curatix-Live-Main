import * as React from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  CalendarDays,
  Instagram,
  Star,
  Twitter,
  Users,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { EventGrid } from '@/components/discovery/event-grid';
import type { Community } from '@/lib/api/community';
import { cn } from '@/lib/utils/cn';

/**
 * An organizer's community page, drawn from one payload.
 *
 * Presentational and hook-free on purpose, so the SAME component renders the
 * public page (server) and the live preview in the editor (client). A preview
 * drawn by different code from the page is a preview that lies.
 *
 * Order, top to bottom: banner, logo + name + verified tick + the numbers that
 * matter (followers, events, rating), social links, About, event highlights,
 * ratings, upcoming events, the team, then the discussion. Every section is
 * absent, not empty, when nothing backs it.
 */
export function CommunityView({
  data,
  actions,
  forum,
  preview = false,
}: {
  data: Community;
  /** The follow control (live) or nothing (preview). */
  actions?: React.ReactNode;
  /** The discussion forum (live) or a placeholder (preview). */
  forum?: React.ReactNode;
  preview?: boolean;
}) {
  const { organization: org, reviews, highlights, team, upcoming_events, past_events } = data;
  const initials = org.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const socials: { href: string; label: string; Icon: LucideIcon }[] = [
    { href: org.socials.instagram, label: 'Instagram', Icon: Instagram },
    { href: org.socials.youtube, label: 'YouTube', Icon: Youtube },
    { href: org.socials.x, label: 'X', Icon: Twitter },
  ].filter((s) => Boolean(s.href));

  return (
    <div className="flex flex-col gap-section">
      {/* ── BANNER ─────────────────────────────────────────────────────── */}
      <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-secondary via-muted to-secondary sm:h-60">
        {org.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote user media sized by its frame
          <img src={org.cover_url} alt="" className="size-full object-cover" />
        ) : null}
      </div>

      <div
        className={cn(
          'relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-section px-4 sm:px-6',
          '-mt-12 sm:-mt-16',
        )}
      >
        {/* ── IDENTITY ──────────────────────────────────────────────────── */}
        <header className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-card shadow-sm sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:p-6">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <span className="-mt-14 inline-flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-surface bg-secondary text-h3 font-semibold text-secondary-foreground shadow-md sm:-mt-16 sm:size-28">
              {org.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.logo_url} alt="" className="size-full object-cover" />
              ) : (
                <span aria-hidden>{initials}</span>
              )}
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="flex items-center gap-2 text-h3 sm:text-h2">
                <span className="truncate">{org.name}</span>
                {org.verified_level === 'verified' ? (
                  <BadgeCheck
                    className="size-6 shrink-0 text-primary"
                    aria-label="Verified organiser"
                  />
                ) : null}
              </h1>
              <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-body-sm text-muted-foreground">
                <Stat icon={Users} value={org.follower_count} label="followers" />
                <Stat icon={CalendarDays} value={org.events_count} label="events" />
                {reviews.average !== null ? (
                  <li className="inline-flex items-center gap-1.5">
                    <Star className="size-4 fill-current text-warning" aria-hidden />
                    <span className="font-semibold tabular-nums text-foreground">
                      {reviews.average.toFixed(1)}
                    </span>
                    <span>({reviews.count})</span>
                  </li>
                ) : (
                  <li>No reviews yet</li>
                )}
              </ul>
              {socials.length ? (
                <ul className="mt-1 flex items-center gap-2">
                  {socials.map(({ href, label, Icon }) => (
                    <li key={label}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${org.name} on ${label}`}
                        className="inline-flex size-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Icon className="size-4" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>

        {/* ── ABOUT ─────────────────────────────────────────────────────── */}
        {org.bio ? (
          <Section id="about" title="About">
            <p className="max-w-prose whitespace-pre-line text-body text-muted-foreground">
              {org.bio}
            </p>
          </Section>
        ) : null}

        {/* ── HIGHLIGHTS ────────────────────────────────────────────────── */}
        {highlights.length ? (
          <Section id="highlights" title="Event highlights">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
              {highlights.map((image, index) => (
                <li
                  key={image.id}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-xl bg-muted',
                    index === 0 && 'col-span-2 row-span-2 sm:col-span-1 sm:row-span-1',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.alt}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 hover:scale-105 motion-reduce:transition-none"
                  />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* ── RATINGS ───────────────────────────────────────────────────── */}
        <Section id="ratings" title="Ratings & reviews">
          {reviews.average === null ? (
            <p className="text-body-sm text-muted-foreground">
              No reviews yet. They appear here after people who attended rate an event.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-h1 font-semibold tabular-nums">
                    {reviews.average.toFixed(1)}
                  </span>
                  <span className="text-body-sm text-muted-foreground">
                    from {reviews.count} verified {reviews.count === 1 ? 'review' : 'reviews'}
                  </span>
                </div>
                <Distribution distribution={reviews.distribution} total={reviews.count} />
              </div>
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
                      {preview ? (
                        review.event_title
                      ) : (
                        <Link href={`/events/${review.event_id}`} className="underline">
                          {review.event_title}
                        </Link>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* ── EVENTS ────────────────────────────────────────────────────── */}
        <Section id="upcoming" title="Upcoming events">
          {upcoming_events.length ? (
            <EventGrid events={upcoming_events} />
          ) : (
            <p className="text-body-sm text-muted-foreground">
              Nothing on sale right now. Follow {org.name} to hear when they announce something.
            </p>
          )}
        </Section>

        {past_events.length ? (
          <Section id="past" title="Previous events">
            <EventGrid events={past_events} />
          </Section>
        ) : null}

        {/* ── TEAM ──────────────────────────────────────────────────────── */}
        {team.length ? (
          <Section id="team" title="Meet the team">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {team.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-center"
                >
                  <span className="inline-flex size-20 items-center justify-center overflow-hidden rounded-full bg-secondary text-h4 font-semibold text-secondary-foreground">
                    {member.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={member.photo_url}
                        alt={member.photo_alt}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span aria-hidden>{member.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </span>
                  <span className="text-body-sm font-semibold">{member.name}</span>
                  {member.role ? (
                    <span className="text-caption text-muted-foreground">{member.role}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* ── DISCUSSION ────────────────────────────────────────────────── */}
        <Section id="discussion" title="Discussion">
          {forum ?? (
            <p className="text-body-sm text-muted-foreground">
              {preview
                ? 'Followers will see the discussion forum here.'
                : 'The discussion is not available right now.'}
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon className="size-4" aria-hidden />
      <span className="font-semibold tabular-nums text-foreground">
        {value.toLocaleString('en-IN')}
      </span>
      <span>{label}</span>
    </li>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex flex-col gap-4">
      <h2 id={`${id}-h`} className="text-h4">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Distribution({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  return (
    <ul className="flex min-w-48 flex-1 flex-col gap-1" aria-label="Rating breakdown">
      {[5, 4, 3, 2, 1].map((stars) => {
        const count = distribution[String(stars)] ?? 0;
        const pct = total ? Math.round((count / total) * 100) : 0;
        return (
          <li key={stars} className="flex items-center gap-2 text-caption text-muted-foreground">
            <span className="w-3 tabular-nums">{stars}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-warning"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            </span>
            <span className="w-6 text-right tabular-nums">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}
