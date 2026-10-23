'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { Container } from '@/components/shell/container';
import { RemoteImage } from '@/components/ui/remote-image';
import type { PromoCampaign } from '@/lib/api/cms';
import {
  activeCampaigns,
  isExternalHref,
  safeCampaignHref,
  safeMediaUrl,
} from '@/lib/discovery/promo';
import { cn } from '@/lib/utils/cn';

/**
 * The homepage's ADVERTISING hero — campaigns an operator manages, not events.
 *
 * ── HOW IT DIFFERS FROM THE EVENT SHOWCASE BELOW IT ────────────────────────
 *
 * The showcase recommends bookable events (price, date, availability). This
 * shows editorial/advertising media with a headline and an optional button, and
 * is drawn differently on purpose — a labelled "Promoted" tag, an inset rounded
 * frame, a fixed media aspect — so nobody mistakes an ad for an event. A
 * campaign may link to an event; it never becomes one.
 *
 * ── IT RENDERS NOTHING WITHOUT CAMPAIGNS ───────────────────────────────────
 *
 * `GET /homepage` does not serve campaigns yet (`docs/ADS_HERO_BACKEND_GAP.md`),
 * so today this returns null and the page is the event showcase alone. There is
 * no placeholder slide and no invented creative.
 *
 * ── MOTION AND MEDIA RULES ─────────────────────────────────────────────────
 *
 * • Auto-advance is for still images only, stops on hover/focus/touch, when the
 *   hero is off-screen or the tab is hidden, and never runs under
 *   `prefers-reduced-motion`. There is always a visible Pause/Play control.
 * • Video is `muted` with native controls — sound is the viewer's choice. It
 *   autoplays only when visible, motion is allowed and data-saver is off;
 *   otherwise the poster shows and the viewer presses play.
 * • The frame has a FIXED aspect ratio per breakpoint, so slides of any
 *   dimensions cause zero layout shift, and `object-cover` crops them.
 */

const AUTOPLAY_MS = 7000;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function prefersSavingData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

export function PromoHero({ campaigns }: { campaigns: PromoCampaign[] | undefined }) {
  const slides = React.useMemo(() => activeCampaigns(campaigns), [campaigns]);
  const [index, setIndex] = React.useState(0);
  const [userPaused, setUserPaused] = React.useState(false);
  const [engaged, setEngaged] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const [tabHidden, setTabHidden] = React.useState(false);
  const reduced = usePrefersReducedMotion();
  const rootRef = React.useRef<HTMLElement>(null);
  const touchX = React.useRef<number | null>(null);
  const count = slides.length;
  const current = slides[Math.min(index, Math.max(count - 1, 0))];

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      {
        threshold: 0.25,
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [count]);

  React.useEffect(() => {
    const onChange = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const canAutoplay =
    count > 1 &&
    current?.kind === 'image' &&
    !reduced &&
    !userPaused &&
    !engaged &&
    visible &&
    !tabHidden;

  React.useEffect(() => {
    if (!canAutoplay) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [canAutoplay, index, count]);

  if (count === 0 || !current) return null;

  const go = (next: number) => setIndex(((next % count) + count) % count);
  const href = safeCampaignHref(current.cta_href);
  const showPauseControl = count > 1 && current.kind === 'image' && !reduced;

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label="Promotions"
      className="pt-3 sm:pt-5"
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={() => setEngaged(false)}
      onTouchStart={(event) => {
        // A touch hands control to the viewer for good, and starts a swipe.
        setUserPaused(true);
        touchX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchX.current;
        touchX.current = null;
        const end = event.changedTouches[0]?.clientX;
        if (start === null || end === undefined || count < 2) return;
        const delta = end - start;
        if (Math.abs(delta) >= 40) go(index + (delta < 0 ? 1 : -1));
      }}
    >
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-muted shadow-sm">
          {/* The frame. Fixed aspect per breakpoint = no layout shift, and a phone
              hero that stays well under a full screen (≈ 60% of its width). */}
          <div className="relative aspect-[16/10] w-full sm:aspect-[21/9] xl:aspect-[24/9]">
            {slides.map((slide, i) => (
              <Slide
                key={slide.id}
                slide={slide}
                active={i === index}
                first={i === 0}
                reduced={reduced}
              />
            ))}

            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent"
            />

            <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur sm:left-5 sm:top-5">
              Promoted
            </span>

            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 text-white sm:gap-3 sm:p-8 lg:p-10">
              <h2 className="max-w-2xl text-xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl">
                {current.title}
              </h2>
              {current.description ? (
                <p className="line-clamp-2 max-w-xl text-sm text-white/85 sm:text-base">
                  {current.description}
                </p>
              ) : null}
              {href && current.cta_label ? (
                <div className="mt-1">
                  <Link
                    href={href}
                    {...(isExternalHref(href)
                      ? { target: '_blank', rel: 'noopener noreferrer sponsored' }
                      : {})}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    {current.cta_label}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              ) : null}
            </div>
          </div>

          {count > 1 ? (
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 sm:bottom-6 sm:right-6">
              {showPauseControl ? (
                <ControlButton
                  label={userPaused ? 'Play slideshow' : 'Pause slideshow'}
                  onClick={() => setUserPaused((p) => !p)}
                >
                  {userPaused ? (
                    <Play className="size-4" aria-hidden />
                  ) : (
                    <Pause className="size-4" aria-hidden />
                  )}
                </ControlButton>
              ) : null}
              <ControlButton label="Previous promotion" onClick={() => go(index - 1)}>
                <ChevronLeft className="size-4" aria-hidden />
              </ControlButton>
              <ControlButton label="Next promotion" onClick={() => go(index + 1)}>
                <ChevronRight className="size-4" aria-hidden />
              </ControlButton>
            </div>
          ) : null}
        </div>

        {count > 1 ? (
          <div
            className="mt-3 flex justify-center gap-2"
            role="group"
            aria-label="Choose promotion"
          >
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show promotion ${i + 1} of ${count}: ${slide.title}`}
                aria-current={i === index ? 'true' : undefined}
                className="flex size-6 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    'h-1.5 rounded-full bg-foreground/25 transition-all duration-base motion-reduce:transition-none',
                    i === index ? 'w-6 bg-foreground' : 'w-1.5',
                  )}
                />
              </button>
            ))}
          </div>
        ) : null}
      </Container>
    </section>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      {children}
    </button>
  );
}

function Slide({
  slide,
  active,
  first,
  reduced,
}: {
  slide: PromoCampaign;
  active: boolean;
  first: boolean;
  reduced: boolean;
}) {
  const media = safeMediaUrl(slide.media_url);
  const mobile = safeMediaUrl(slide.mobile_media_url);
  const poster = safeMediaUrl(slide.poster_url);
  return (
    <div
      aria-hidden={!active}
      role="group"
      aria-roledescription="slide"
      className={cn(
        'absolute inset-0 transition-opacity duration-slow motion-reduce:transition-none',
        active ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {slide.kind === 'video' ? (
        active && media ? (
          <PromoVideo src={media} poster={poster} label={slide.alt_text} reduced={reduced} />
        ) : poster ? (
          <RemoteImage src={poster} alt="" className="size-full object-cover" />
        ) : null
      ) : (
        <picture>
          {mobile ? <source media="(max-width: 639px)" srcSet={mobile} /> : null}
          <RemoteImage
            src={media}
            alt={slide.alt_text}
            loading={first ? 'eager' : 'lazy'}
            className="size-full object-cover"
          />
        </picture>
      )}
    </div>
  );
}

function PromoVideo({
  src,
  poster,
  label,
  reduced,
}: {
  src: string;
  poster: string | null;
  label: string;
  reduced: boolean;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);
  // Autoplay only when it is polite: visible, motion allowed, not on data-saver.
  const mayAutoplay = !reduced && !prefersSavingData();

  React.useEffect(() => {
    const video = ref.current;
    if (!video || !mayAutoplay) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void video.play().catch(() => undefined);
      else video.pause();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [mayAutoplay]);

  return (
    <video
      ref={ref}
      className="size-full object-cover"
      src={src}
      poster={poster ?? undefined}
      aria-label={label}
      muted
      loop
      playsInline
      controls
      preload={mayAutoplay ? 'metadata' : 'none'}
    />
  );
}
