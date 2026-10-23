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
