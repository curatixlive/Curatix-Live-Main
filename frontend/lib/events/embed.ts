/**
 * The iframe `src` for a previous-event video — or null if it is not one we
 * are willing to put in a frame.
 *
 * The backend already builds the embed URL from a host allow-list
 * (`core.video_embeds`) and never stores a pasted link. This is the SECOND
 * check, at the point of use: a row edited in the database, an old record, or a
 * bug upstream must not be able to turn `<iframe src>` into an arbitrary page on
 * the busiest route of the site. Only the two embed shapes the backend can
 * produce pass, with strict id patterns, and the query string is rebuilt here
 * rather than inherited.
 *
 * Autoplay is requested because this is only ever called AFTER the visitor
 * pressed play, so the browser permits sound; `rel=0` keeps the player from
 * suggesting unrelated videos at the end.
 */
export function safeEmbedSrc(embedUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(embedUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  if (host === 'www.youtube.com' || host === 'www.youtube-nocookie.com') {
    const match = /^\/embed\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
    if (!match) return null;
    return `https://${host}/embed/${match[1]}?autoplay=1&rel=0&playsinline=1`;
  }
  if (host === 'player.vimeo.com') {
    const match = /^\/video\/([0-9]{6,12})\/?$/.exec(url.pathname);
    if (!match) return null;
    return `https://player.vimeo.com/video/${match[1]}?autoplay=1&playsinline=1`;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Inline playback (the homepage highlights stage)                             */
/* -------------------------------------------------------------------------- */

export type EmbedProvider = 'youtube' | 'vimeo';

export type InlineEmbed = {
  provider: EmbedProvider;
  id: string;
  /** The iframe `src`: muted, inline, and controllable over postMessage. */
  src: string;
  /** The ONLY origin commands may be posted to and messages accepted from. */
  postOrigin: string;
  /** Where to send somebody if the embed will not play. */
  watchUrl: string;
};

/**
 * The same host/id allow-list as `safeEmbedSrc` — and the query is again built
 * here, never inherited — but for a player that autoplays MUTED when the section
 * scrolls into view and is paused and resumed by us.
 *
 * `autoplay=0` still returns a controllable frame: the stage uses that for the
 * viewer who has asked for reduced motion or data saving, where nothing may start
 * until they press play.
 */
export function inlineEmbed(
  embedUrl: string,
  { autoplay, origin }: { autoplay: boolean; origin?: string },
): InlineEmbed | null {
  let url: URL;
  try {
    url = new URL(embedUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  if (host === 'www.youtube.com' || host === 'www.youtube-nocookie.com') {
    const match = /^\/embed\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
    if (!match) return null;
    const id = match[1] as string;
    const params = new URLSearchParams({
      autoplay: autoplay ? '1' : '0',
      mute: '1',
      controls: '1',
      rel: '0',
      playsinline: '1',
      enablejsapi: '1',
    });
    // `origin` lets the player accept our commands; it must match the page.
    if (origin && /^https?:\/\/[A-Za-z0-9.:-]+$/.test(origin)) params.set('origin', origin);
    return {
      provider: 'youtube',
      id,
      src: `https://${host}/embed/${id}?${params.toString()}`,
      postOrigin: `https://${host}`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }
  if (host === 'player.vimeo.com') {
    const match = /^\/video\/([0-9]{6,12})\/?$/.exec(url.pathname);
    if (!match) return null;
    const id = match[1] as string;
    const params = new URLSearchParams({
      autoplay: autoplay ? '1' : '0',
      muted: '1',
      playsinline: '1',
      api: '1',
    });
    return {
      provider: 'vimeo',
      id,
      src: `https://player.vimeo.com/video/${id}?${params.toString()}`,
      postOrigin: 'https://player.vimeo.com',
      watchUrl: `https://vimeo.com/${id}`,
    };
  }
  return null;
}

export type PlayerCommand = 'play' | 'pause' | 'mute' | 'unmute';

/** The message that tells the provider's player to do `command`. */
export function playerCommand(provider: EmbedProvider, command: PlayerCommand): string {
  if (provider === 'youtube') {
    const func = { play: 'playVideo', pause: 'pauseVideo', mute: 'mute', unmute: 'unMute' }[
      command
    ];
    return JSON.stringify({ event: 'command', func, args: [] });
  }
  switch (command) {
    case 'play':
      return JSON.stringify({ method: 'play' });
    case 'pause':
      return JSON.stringify({ method: 'pause' });
    case 'mute':
      return JSON.stringify({ method: 'setVolume', value: 0 });
    case 'unmute':
      return JSON.stringify({ method: 'setVolume', value: 1 });
  }
}

/**
 * Is a message from the player telling us it is playing (true), not playing
 * (false), or saying nothing about it (null)? YouTube reports `onStateChange`
 * (1 = playing) and `infoDelivery.playerState`; anything else is ignored.
 */
export function playingFromMessage(provider: EmbedProvider, raw: unknown): boolean | null {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  if (provider === 'youtube') {
    if (message.event === 'onStateChange' && typeof message.info === 'number') {
      return message.info === 1;
    }
    const info = message.info as Record<string, unknown> | undefined;
    if (message.event === 'infoDelivery' && info && typeof info.playerState === 'number') {
      return info.playerState === 1;
    }
    return null;
  }
  if (message.event === 'play' || message.event === 'playing') return true;
  if (message.event === 'pause' || message.event === 'ended') return false;
  return null;
}
