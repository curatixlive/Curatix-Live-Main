'use client';

import * as React from 'react';
import Link from 'next/link';
import { Film, Play } from 'lucide-react';
import { Container } from '@/components/shell/container';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { RemoteImage } from '@/components/ui/remote-image';
import type { HomepageHighlight } from '@/lib/api/cms';
import { formatEventDate } from '@/lib/discovery/format';
import { safeEmbedSrc } from '@/lib/events/embed';
import { eventPath } from '@/lib/events/ref';
import { videoThumbnail } from '@/lib/events/video-thumbnail';
import { cn } from '@/lib/utils/cn';
import { ScrollRail } from './scroll-rail';

/**
 * RELIVE THE HIGHLIGHTS — video from events that have already happened.
 *
 * ── WHERE THE VIDEOS COME FROM ───────────────────────────────────────────────
 *
 * Operator-curated rows (Admin → Studio → Past-event videos), each pointing at a
 * video an organiser attached to their own event. The backend only serves a row
 * whose event has already taken place and whose video is still visible, so this
 * is never an advert for something upcoming. Nothing is hardcoded here.
 *
 * ── NOTHING DOWNLOADS UNTIL SOMEBODY PRESSES PLAY ────────────────────────────
 *
 * The cards are pictures: the event's own poster, or the video's still where the
 * provider has a cheap one. No player, no iframe and no provider script is
 * loaded for the page — the frame is created inside the modal only after a
 * press, which is also what lets it autoplay with sound (a gesture happened).
 * The iframe is destroyed when the modal closes, which stops playback.
 *
 * The modal is Radix's dialog: focus is trapped and returned, Escape and the
 * close button both work, and the page behind is inert while it is open. The
 * player's own controls handle play, pause and mute.
 */

export function HighlightsShowcase({
  highlights,
}: {
  highlights: HomepageHighlight[] | undefined;
}) {
  const items = (highlights ?? []).filter((h) => safeEmbedSrc(h.video.embed_url) !== null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const current = items.find((h) => h.id === openId) ?? null;
  const src = current ? safeEmbedSrc(current.video.embed_url) : null;

  return (
    <section aria-labelledby="highlights-heading" className="py-section lg:py-section-lg">
      <Container className="flex flex-col gap-5 sm:gap-8">
        <div className="flex flex-col gap-2">
          <div className="h-0.5 w-10 rounded-full bg-foreground" aria-hidden />
          <h2
            id="highlights-heading"
            className="text-h4 font-bold tracking-tight sm:text-h3 lg:text-h2"
          >
            Relive the highlights
          </h2>
          <p className="text-body-sm text-muted-foreground sm:text-body">
            Moments from events that have already happened.
          </p>
        </div>

        {items.length ? (
          <ScrollRail label="past event videos">
            {items.map((item) => (
              <li
                key={item.id}
                className="w-[78%] shrink-0 snap-start sm:w-[44%] lg:w-[31%] xl:w-[23%]"
              >
                <HighlightCard item={item} onPlay={() => setOpenId(item.id)} />
              </li>
            ))}
          </ScrollRail>
        ) : (
          <EmptyHighlights />
        )}
      </Container>

      <Modal open={current !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <ModalContent className="max-w-4xl gap-3 p-4 sm:p-6">
          <ModalHeader>
            <ModalTitle>{current?.event.title ?? 'Event highlight'}</ModalTitle>
            <ModalDescription>
              {current
                ? `${[current.event.venue, current.event.city].filter(Boolean).join(', ')} · ${formatEventDate(current.event.starts_at)}`
                : ''}
            </ModalDescription>
          </ModalHeader>
          {/* The frame exists ONLY while the modal is open. A vertical video
              (a YouTube Short) gets a tall frame; everything else is 16:9. */}
          {current && src ? (
            <div
              className={cn(
                'mx-auto w-full overflow-hidden rounded-xl bg-black',
                current.video.is_vertical ? 'aspect-[9/16] max-h-[70vh] w-auto' : 'aspect-video',
              )}
            >
              <iframe
                src={src}
                title={`${current.event.title} highlights`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                className="size-full border-0"
              />
            </div>
          ) : null}
          {current ? (
            <Link
              href={eventPath(current.event)}
              className="w-fit text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              About this event
            </Link>
          ) : null}
        </ModalContent>
      </Modal>
    </section>
  );
}

function HighlightCard({ item, onPlay }: { item: HomepageHighlight; onPlay: () => void }) {
  const still = item.event.poster_url || videoThumbnail(item.video.embed_url);
  const where = [item.event.venue, item.event.city].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play highlights from ${item.event.title}`}
      className="group block w-full text-left focus-visible:outline-none"
    >
      <span className="relative block aspect-video overflow-hidden rounded-2xl bg-muted ring-offset-background group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
        <RemoteImage
          src={still}
          alt=""
          className="size-full object-cover transition-transform duration-slow group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          fallback={
            <span className="flex size-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/20">
              <Film className="size-8 text-muted-foreground" aria-hidden />
            </span>
          }
        />
        <span aria-hidden className="absolute inset-0 bg-black/25" />
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-black shadow-lg transition-transform duration-base group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        >
          <Play className="ml-0.5 size-6 fill-current" />
        </span>
      </span>
      <span className="mt-3 block">
        <span className="line-clamp-1 block text-base font-semibold text-foreground">
          {item.event.title}
        </span>
        <span className="line-clamp-1 block text-sm text-muted-foreground">
          {[where, formatEventDate(item.event.starts_at)].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  );
}

/**
 * No videos curated yet. Not a skeleton (nothing is loading) and not fake
 * clips: an honest invitation, pointing at things that exist.
 */
function EmptyHighlights() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border-strong bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div className="flex max-w-xl flex-col gap-1.5">
        <h3 className="text-h4">Highlights from our events will play here</h3>
        <p className="text-sm text-muted-foreground">
          Once organisers share video from events that have taken place, the best of it appears in
          this reel. Hosting something? Add a video to your event and it can be featured.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/events"
          className="inline-flex h-control items-center rounded-full border border-border bg-surface px-pill text-label transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          Browse events
        </Link>
        <Link
          href="/organizer"
          className="inline-flex h-control items-center rounded-full bg-cta px-pill text-label text-cta-foreground transition-colors hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          Host an event
        </Link>
      </div>
    </div>
  );
}
