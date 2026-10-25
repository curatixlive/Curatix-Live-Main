'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, ChevronRight, FileText, HelpCircle, MapPin, Ticket } from 'lucide-react';
import type { EventContent } from '@/lib/api/event-content';
import { LineupRail } from './lineup-rail';
import type { EventCard as EventCardData, EventDetail } from '@/lib/api/types';
import { formatEventDateTime, formatEventTime } from '@/lib/discovery/format';
import { selectSimilarEvents, isOrganiserRail } from '@/lib/discovery/similar-events';
import { eventPath } from '@/lib/events/ref';
import { DistanceLabel } from '@/components/location/distance-label';
import { cn } from '@/lib/utils/cn';
import type { TicketTier } from '@/lib/api/types';
import { TrackEventView } from '@/components/analytics/track-event-view';
import { AddToCalendar } from './add-to-calendar';
import {
  DirectionsButton,
  FactsGrid,
  HelpCard,
  OffersCard,
  SceneTabs,
  VibeDivider,
  type SceneTab,
} from './scene/scene-parts';
import { type GalleryImage } from './hero-gallery';
import { GalleryGrid } from './gallery-grid';
import { videoThumbnail } from '@/lib/events/video-thumbnail';
import { ShareMenu } from './share-menu';
import type { SubSheetType } from './event-sub-sheets';

/**
 * Everything below the poster inside the mobile event widget.
 *
 * ── THE ORDER IS THE ARGUMENT ─────────────────────────────────────────────
 *
 * Category, title, when, where, how long until it starts, what it costs, what
 * it is, what to know, what it looks like, who is running it, the small print,
 * what else to look at. That is "what is it / when / where / what does it cost
 * / what should I know / who organises it / what else" — the order somebody
 * actually decides in, and it is fixed rather than an arrangement.
 *
 * ── A SECTION WITH NOTHING BEHIND IT IS ABSENT, NOT EMPTY ─────────────────
 *
 * Every block here is conditional on real data. No gallery when the organiser
 * uploaded no photographs; no running-order row when they published none; no
 * second category pill invented to balance the first; no similar-events rail
 * padded with unrelated events. An empty panel behind a chevron is worse than
 * no chevron, and on access or age information an empty panel reads as a claim
 * that there is no restriction — which is not what a blank column means.
 *
 * ── AND IT REUSES THE PAGE'S COMPONENTS ───────────────────────────────────
 *
 * `Countdown`, `HeroGallery`, `ShareMenu` and `AddToCalendar` are
 * the same ones the desktop event page renders. They are token-styled, and this
 * surface is always dark, which the deck handles by scoping `dark` around the
 * whole widget. So there is one lightbox, one calendar builder and one clock —
 * not a mobile fork of each.
 */

export type EventWidgetContentProps = {
  event: EventCardData;
  detail: EventDetail | null;
  content: EventContent | null;
  tiers: TicketTier[] | null;
  /** The feed the widget was opened from — the pool for "similar events". */
  pool: readonly EventCardData[];
  onOpenSheet: (sheet: NonNullable<SubSheetType>) => void;
  /** Switches the deck to another event without leaving the widget. */
  onSelectEvent?: (eventId: string) => void;
  /** Opens the lineup's own full-screen viewer on that person. Optional: the
   *  desktop page renders this content without a deck around it, and a face
   *  that is not a button there is the existing behaviour, not a regression. */
  onOpenCrew?: (personId: string) => void;
};

/**
 * WHAT THE EVENT IS — the title, the date and the two info cards.
 *
 * A separate export from `EventWidgetContent` because the page renders the
 * hero between the branding and these, and everything below them in one run.
 * It was split to make room for a sticky tab bar; the tab bar is gone and the
 * split stays, because it costs nothing and the two halves answer different
 * questions — "what am I looking at" and "tell me more".
 */
export function EventWidgetSummary({
  event,
  detail,
  onOpenSheet,
  className,
}: {
  event: EventCardData;
  /** Optional: only the venue's coordinates are read, for a precise directions link. */
  detail?: EventDetail | null;
  content?: EventContent | null | undefined;
  onOpenSheet: (sheet: NonNullable<SubSheetType>) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 px-4 pt-5', className)}>
      {/* The name, set like a poster line: capitals, heavy, a little tracking. */}
      <h2 className="text-h3 font-extrabold uppercase leading-snug tracking-wide text-foreground">
        {event.title}
      </h2>

      <div className="flex flex-col divide-y divide-border border-y border-border">
        <div className="flex items-center gap-3 py-3.5">
          <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-body-sm font-semibold text-foreground">
            {formatSceneDate(event.starts_at)}
          </p>
        </div>
        <div className="flex items-center gap-3 py-3.5">
          <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <button
            type="button"
            onClick={() => onOpenSheet('venue')}
            className="flex min-w-0 flex-1 flex-col text-left"
          >
            <span className="truncate text-body-sm font-semibold text-foreground">
              {event.venue}
            </span>
            <span className="truncate text-caption text-muted-foreground">
              {event.city}
              {detail ? (
                <DistanceLabel venue={detail} prefix=" · " className="text-primary" />
              ) : null}
            </span>
          </button>
          <DirectionsButton
            event={{
              venue: event.venue,
              city: event.city,
              latitude: detail?.latitude ?? null,
              longitude: detail?.longitude ?? null,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** "17th Oct • 8:00 PM", in Indian time: the day a person means is the local one. */
function formatSceneDate(iso: string): string {
  const date = new Date(iso);
  const day = Number(
    new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' }).format(date),
  );
  const month = new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date);
  const ordinal =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  return `${day}${ordinal} ${month} • ${formatEventTime(iso)}`;
}

export function EventWidgetContent({
  event,
  detail,
  content,
  pool,
  onOpenSheet,
  onSelectEvent,
  onOpenCrew,
}: EventWidgetContentProps) {
  const galleryImages: GalleryImage[] = React.useMemo(() => {
    const media = content?.media ?? [];
    const videos = media
      .filter((item) => item.kind === 'video')
      .map((item) => ({
        kind: 'video' as const,
        url: item.url,
        alt: item.alt_text || `${event.title} trailer`,
        poster: videoThumbnail(item.url) ?? undefined,
      }));
    const photos = media
      .filter((item) => item.kind === 'gallery')
      .map((item) => ({ url: item.url, alt: item.alt_text || event.title }));
    return [...videos, ...photos];
  }, [content, event.title]);

  const similar = React.useMemo(
    () => selectSimilarEvents(event, pool, { limit: 8 }),
    [event, pool],
  );
  const railIsOrganiser = isOrganiserRail(event, similar);

  const about = detail?.description?.trim() || detail?.short_description?.trim() || '';
  const hasPhotos = galleryImages.length > 0;

  const tabs = React.useMemo<SceneTab[]>(
    () =>
      [
        about ? { id: 'scene-about', label: 'About' } : null,
        hasPhotos ? { id: 'scene-photos', label: 'Photos' } : null,
        { id: 'scene-venue', label: 'Venue' },
        { id: 'scene-help', label: 'Help' },
      ].filter((tab): tab is SceneTab => tab !== null),
    [about, hasPhotos],
  );

  return (
    <div className="flex flex-col gap-7 px-4 pb-4 pt-5">
      <TrackEventView eventId={event.id} />

      <SceneTabs tabs={tabs} />

      <OffersCard eventId={event.id} />

      {about ? (
        <section id="scene-about" className="flex scroll-mt-20 flex-col gap-3">
          <h3 className="text-h4 text-foreground">About</h3>
          {/* The whole description, at its own height — no clamp and no
              "...more" to press for text the page has room for. */}
          <p className="whitespace-pre-line text-body-sm leading-relaxed text-muted-foreground">
            {about}
          </p>
          <FactsGrid detail={detail} />
        </section>
      ) : null}

      <LineupRail crew={content?.crew ?? []} onOpenPortrait={onOpenCrew} />

      {hasPhotos ? (
        <section id="scene-photos" className="flex scroll-mt-20 flex-col gap-4">
          <VibeDivider>Check out the vibe</VibeDivider>
          <h3 className="text-h4 text-foreground">Photos &amp; Videos</h3>
          <GalleryGrid images={galleryImages} />
        </section>
      ) : null}

      <section id="scene-venue" className="flex scroll-mt-20 flex-col gap-3">
        <h3 className="text-h4 text-foreground">Venue</h3>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenSheet('venue')}
            className="flex min-w-0 flex-1 flex-col text-left"
          >
            <span className="text-body-sm font-semibold text-foreground">
              {event.venue}
              <span className="font-normal text-muted-foreground"> · {event.city}</span>
            </span>
            <span className="text-caption text-muted-foreground">Venue details</span>
          </button>
          <DirectionsButton
            event={{
              venue: event.venue,
              city: event.city,
              latitude: detail?.latitude ?? null,
              longitude: detail?.longitude ?? null,
            }}
          />
        </div>
      </section>

      <section id="scene-help" className="flex scroll-mt-20 flex-col gap-3">
        <HelpCard />
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          <MoreRow
            icon={<FileText className="size-5" aria-hidden />}
            label="Event terms and conditions"
            onClick={() => onOpenSheet('terms')}
          />
          <MoreRow
            icon={<HelpCircle className="size-5" aria-hidden />}
            label="Frequently asked questions"
            onClick={() => onOpenSheet('faq')}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-h4 text-foreground">Organised by</h3>
        <button
          type="button"
          onClick={() => onOpenSheet('organiser')}
          aria-label={`About ${event.organization_name}`}
          className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5 text-left transition-colors active:bg-muted"
        >
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-body font-bold text-foreground"
            aria-hidden
          >
            {(event.organization_name || '?').trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-foreground">
            {event.organization_name}
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </section>

      <div className="flex items-center gap-2">
        <ShareMenu title={event.title} path={eventPath(event)} className="flex-1 justify-center" />
        {detail ? <AddToCalendar event={detail} className="flex-1 justify-center" /> : null}
      </div>

      {similar.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-h4 text-foreground">
            {railIsOrganiser ? `More from ${event.organization_name}` : 'Similar events'}
          </h3>
          <ul className="-mx-4 flex touch-manipulation snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {similar.map((other) => (
              <li key={other.id} className="w-36 shrink-0 snap-start">
                <SimilarCard event={other} onSelect={onSelectEvent} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

function MoreRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-control items-center gap-3.5 p-3.5 text-left transition-colors active:bg-muted"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-foreground">
        {label}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/**
 * A card in the similar-events rail.
 *
 * When the deck can switch to it in place (`onSelectEvent`) it is a BUTTON and
 * stays inside the widget, which is the whole architecture — the widget is the
 * mobile event page, so moving between events must not leave it. It falls back
 * to a real link when it cannot, so the row is never a dead end.
 */
function SimilarCard({
  event,
  onSelect,
}: {
  event: EventCardData;
  onSelect?: (eventId: string) => void;
}) {
  const body = (
    <>
      <span className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted">
        {event.poster_url ? (
          <Image src={event.poster_url} alt="" fill sizes="144px" className="object-cover" />
        ) : (
          <Ticket className="absolute inset-0 m-auto size-8 text-muted-foreground" aria-hidden />
        )}
      </span>
      <span className="mt-2 block truncate text-caption font-semibold text-foreground">
        {event.title}
      </span>
      <span className="block truncate text-caption text-muted-foreground">
        {formatEventDateTime(event.starts_at)}
      </span>
    </>
  );

  const className = cn('block w-full text-left transition-transform active:scale-95');

  if (onSelect) {
    return (
      <button type="button" onClick={() => onSelect(event.id)} className={className}>
        {body}
      </button>
    );
  }
  return (
    <Link href={eventPath(event)} className={className}>
      {body}
    </Link>
  );
}
