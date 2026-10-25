'use client';

import * as React from 'react';
import Link from 'next/link';
import { Film, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { Container } from '@/components/shell/container';
import { RemoteImage } from '@/components/ui/remote-image';
import type { HomepageHighlight } from '@/lib/api/cms';
import { formatEventDate } from '@/lib/discovery/format';
import {
  inlineEmbed,
  playerCommand,
  playingFromMessage,
  type PlayerCommand,
} from '@/lib/events/embed';
import { eventPath } from '@/lib/events/ref';
import { videoThumbnail } from '@/lib/events/video-thumbnail';
import { cn } from '@/lib/utils/cn';

/**
 * RELIVE THE HIGHLIGHTS — a stage that plays itself, muted, while you are looking
 * at it.
 *
 * ── WHEN IT PLAYS ────────────────────────────────────────────────────────────
 *
 * Nothing loads until the section first scrolls into view (so a visitor who never
 * gets here downloads no player). From then on the ACTIVE video plays muted while
 * the section is at least half on screen and the tab is visible; it is PAUSED the
 * moment the section scrolls away or the tab is hidden, and RESUMED when it comes
 * back — the same frame, not a second instance. Exactly one frame ever exists:
 * choosing another highlight replaces it, so videos can never play on top of each
 * other, and nothing keeps playing in the background.
 *
 * Autoplay is a request, not a promise. Browsers allow MUTED autoplay, which is
 * all this asks for; if one still refuses, the player's own play button is there
 * and our button reflects what the player actually reports (we listen for its
 * state), rather than claiming it is playing.
 *
 * ── WHEN IT DOES NOT ─────────────────────────────────────────────────────────
 *
 * Under `prefers-reduced-motion`, with data-saver on, or when an operator has
 * switched autoplay off, nothing starts by itself: the viewer sees the poster and a
 * play button. Pressing play (or choosing a thumbnail) is explicit, and honoured.
 *
 * ── HOW IT IS CONTROLLED ─────────────────────────────────────────────────────
 *
 * Pause, resume and mute are `postMessage` commands to the provider's own player
 * (`lib/events/embed.ts`), sent only to the exact origin the frame was built for,
 * and only messages from that frame's window are believed. No provider script is
 * loaded into our page.
 */

const LOAD_TIMEOUT_MS = 10_000;

function useMediaFlags() {
  const [reduced, setReduced] = React.useState(false);
  const [saveData, setSaveData] = React.useState(false);
  const [tabHidden, setTabHidden] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    setSaveData(Boolean(connection?.saveData));
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      query.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return { reduced, saveData, tabHidden };
}

export function HighlightsShowcase({
  highlights,
  autoplay = true,
}: {
  highlights: HomepageHighlight[] | undefined;
  /** Set by an operator in Admin → Homepage. */
  autoplay?: boolean;
}) {
  const items = React.useMemo(
    () =>
      (highlights ?? []).filter(
        (h) => inlineEmbed(h.video.embed_url, { autoplay: false }) !== null,
      ),
    [highlights],
  );
  const [activeId, setActiveId] = React.useState<string | null>(items[0]?.id ?? null);
  const active = items.find((h) => h.id === activeId) ?? items[0] ?? null;

  const rootRef = React.useRef<HTMLElement>(null);
  const [inView, setInView] = React.useState(false);
  const [everInView, setEverInView] = React.useState(false);
  const [userStarted, setUserStarted] = React.useState(false);
  const [userPaused, setUserPaused] = React.useState(false);
  const { reduced, saveData, tabHidden } = useMediaFlags();

  const autoplayAllowed = autoplay && !reduced && !saveData;
  const mounted = Boolean(active) && ((autoplayAllowed && everInView) || userStarted);
  const shouldPlay = mounted && inView && !tabHidden && !userPaused;

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      // No way to observe: behave as if it is on screen once, never loop.
      setInView(true);
      setEverInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        const on = Boolean(entry && entry.isIntersecting && entry.intersectionRatio >= 0.4);
        setInView(on);
        if (on) setEverInView(true);
      },
      { threshold: [0, 0.2, 0.4, 0.6] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [items.length]);

  const select = (id: string) => {
    setActiveId(id);
    setUserStarted(true); // choosing a video is an explicit request to watch it
    setUserPaused(false);
  };

  return (
    <section
      ref={rootRef}
      aria-labelledby="highlights-heading"
      className="py-section lg:py-section-lg"
    >
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

        {active ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
            <Stage
              key={active.id}
              item={active}
              mounted={mounted}
              shouldPlay={shouldPlay}
              userPaused={userPaused}
              onStart={() => {
                setUserStarted(true);
                setUserPaused(false);
              }}
              onUserPause={setUserPaused}
            />
            <Picker items={items} activeId={active.id} onSelect={select} />
          </div>
        ) : (
          <EmptyHighlights />
        )}
      </Container>
    </section>
  );
}

function Stage({
  item,
  mounted,
  shouldPlay,
  userPaused,
  onStart,
  onUserPause,
}: {
  item: HomepageHighlight;
  mounted: boolean;
  shouldPlay: boolean;
  userPaused: boolean;
  onStart: () => void;
  onUserPause: (paused: boolean) => void;
}) {
  const embed = React.useMemo(
    () =>
      inlineEmbed(item.video.embed_url, {
        autoplay: true,
        origin: typeof window === 'undefined' ? undefined : window.location.origin,
      }),
    [item.video.embed_url],
  );
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(true);
  const still = item.event.poster_url || videoThumbnail(item.video.embed_url);
  const where = [item.event.venue, item.event.city].filter(Boolean).join(', ');

  const send = React.useCallback(
    (command: PlayerCommand) => {
      const target = frameRef.current?.contentWindow;
      if (!target || !embed) return;
      target.postMessage(playerCommand(embed.provider, command), embed.postOrigin);
    },
    [embed],
  );

  // A frame that never loads (offline, blocked, removed) becomes a way out, not a
  // spinner forever.
  React.useEffect(() => {
    if (!mounted || loaded) return;
    const id = window.setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [mounted, loaded]);

  // Believe only the frame we built, from the origin we built it for.
  React.useEffect(() => {
    if (!mounted || !embed) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== embed.postOrigin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const state = playingFromMessage(embed.provider, event.data);
      if (state !== null) setPlaying(state);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [mounted, embed]);

  // Pause when the section leaves the screen, resume when it returns — the SAME
  // frame, told what to do. Waits for the frame to be ready to listen.
  React.useEffect(() => {
    if (!mounted || !loaded) return;
    const id = window.setTimeout(() => send(shouldPlay ? 'play' : 'pause'), 350);
    return () => window.clearTimeout(id);
  }, [mounted, loaded, shouldPlay, send]);

  if (!embed) return null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
        <RemoteImage
          src={still}
          alt=""
          className="absolute inset-0 size-full object-cover"
          fallback={
            <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/20">
              <Film className="size-10 text-muted-foreground" aria-hidden />
            </span>
          }
        />

        {mounted ? (
          <iframe
            ref={frameRef}
            src={embed.src}
            title={`${item.event.title} highlights`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => {
              setLoaded(true);
              setFailed(false);
              // Ask the player to report its state, so our button tells the truth.
              frameRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
                embed.postOrigin,
              );
            }}
            className={cn(
              'absolute inset-0 size-full border-0 transition-opacity duration-slow motion-reduce:transition-none',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
          />
        ) : (
          <>
            <span aria-hidden className="absolute inset-0 bg-black/30" />
            <button
              type="button"
              onClick={onStart}
              aria-label={`Play highlights from ${item.event.title}`}
              className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-black shadow-lg transition-transform duration-base hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              <Play className="ml-1 size-7 fill-current" aria-hidden />
            </button>
          </>
        )}

        {mounted && !loaded && !failed ? (
          <span
            role="status"
            className="absolute inset-0 flex items-center justify-center bg-black/40"
          >
            <Loader2
              className="size-8 animate-spin text-white motion-reduce:animate-none"
              aria-hidden
            />
            <span className="sr-only">Loading video</span>
          </span>
        ) : null}

        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-6 text-center text-white">
            <p className="text-sm">This video could not be loaded here.</p>
            <a
              href={embed.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Watch on {embed.provider === 'youtube' ? 'YouTube' : 'Vimeo'}
            </a>
          </div>
        ) : null}

        {/* Our own pause and mute — YouTube only, where we can ask the player what
            it is doing. Vimeo keeps its own controls. */}
        {mounted && loaded && embed.provider === 'youtube' ? (
          <div className="absolute right-3 top-3 z-10 flex gap-1.5">
            <StageButton
              label={playing ? 'Pause video' : 'Play video'}
              onClick={() => {
                const pause = playing;
                onUserPause(pause);
                send(pause ? 'pause' : 'play');
              }}
            >
              {playing ? (
                <Pause className="size-4" aria-hidden />
              ) : (
                <Play className="size-4" aria-hidden />
              )}
            </StageButton>
            <StageButton
              label={muted ? 'Unmute video' : 'Mute video'}
              onClick={() => {
                setMuted(!muted);
                send(muted ? 'unmute' : 'mute');
              }}
            >
              {muted ? (
                <VolumeX className="size-4" aria-hidden />
              ) : (
                <Volume2 className="size-4" aria-hidden />
              )}
            </StageButton>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground sm:text-lg">
            {item.event.title}
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {[where, formatEventDate(item.event.starts_at)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Link
          href={eventPath(item.event)}
          className="text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          About this event
        </Link>
      </div>
      {userPaused ? <p className="sr-only">Playback paused</p> : null}
    </div>
  );
}

function StageButton({
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
      className="flex size-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

/** One thumbnail per highlight. A row on a phone, a column from `lg`. */
function Picker({
  items,
  activeId,
  onSelect,
}: {
  items: HomepageHighlight[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (items.length < 2) return null;
  return (
    <div className="relative min-w-0">
      <ul
        aria-label="Choose a highlight"
        className="scrollbar-none -mx-4 flex touch-manipulation snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 lg:absolute lg:inset-0 lg:mx-0 lg:scroll-px-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:px-0 lg:pb-0"
      >
        {items.map((item) => {
          const current = item.id === activeId;
          const still = item.event.poster_url || videoThumbnail(item.video.embed_url);
          return (
            <li key={item.id} className="w-44 shrink-0 snap-start lg:w-auto">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={current ? 'true' : undefined}
                aria-label={`Play highlights from ${item.event.title}`}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  'flex-col lg:flex-row',
                  current
                    ? 'border-foreground/50 bg-muted'
                    : 'border-border bg-surface hover:bg-muted/60',
                )}
              >
                <span className="relative block aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-muted lg:w-32">
                  <RemoteImage
                    src={still}
                    alt=""
                    className="size-full object-cover"
                    fallback={
                      <span className="flex size-full items-center justify-center">
                        <Film className="size-5 text-muted-foreground" aria-hidden />
                      </span>
                    }
                  />
                  {current ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <Play className="size-5 fill-white text-white" aria-hidden />
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0 self-start lg:self-center">
                  <span className="line-clamp-2 block text-sm font-semibold text-foreground">
                    {item.event.title}
                  </span>
                  <span className="line-clamp-1 block text-xs text-muted-foreground">
                    {[item.event.city, formatEventDate(item.event.starts_at)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * No videos curated yet. Not a skeleton (nothing is loading) and not fake clips:
 * an honest invitation, pointing at things that exist.
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
