import type { PromoCampaign } from '@/lib/api/cms';

/**
 * Rules for the homepage promo hero that must hold no matter what the CMS
 * sends. Pure so the failure cases (a `javascript:` link, a campaign that
 * ended yesterday, a video with no description) are tests rather than
 * something noticed on the busiest page on the platform.
 */

/** More than this is a slideshow nobody watches, and a heavier first paint. */
export const MAX_CAMPAIGNS = 6;

/**
 * Where a campaign button may send somebody: a path on this site, or an https
 * URL. Anything else — `javascript:`, `data:`, a protocol-relative `//host`,
 * plain http — is dropped, and the campaign renders without a button. The href
 * is operator-typed text that becomes a link on the front page.
 */
export function safeCampaignHref(href: string | undefined | null): string | null {
  const value = (href ?? '').trim();
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isExternalHref(href: string): boolean {
  return !href.startsWith('/');
}

/** Media must be a site path or https — never `data:` or plain http. */
export function safeMediaUrl(url: string | undefined | null): string | null {
  return safeCampaignHref(url);
}

function inWindow(campaign: PromoCampaign, nowMs: number): boolean {
  const start = campaign.starts_at ? Date.parse(campaign.starts_at) : null;
  const end = campaign.ends_at ? Date.parse(campaign.ends_at) : null;
  if (start !== null && !Number.isNaN(start) && nowMs < start) return false;
  if (end !== null && !Number.isNaN(end) && nowMs >= end) return false;
  return true;
}

/**
 * The campaigns that may be shown right now, in display order.
 *
 * A campaign is dropped (never repaired) when it is outside its schedule, has
 * no usable media, or has no title or alt text — an ad with nothing to announce
 * or describe is worse than no ad. The CTA is optional: an unsafe or missing
 * link leaves the artwork as a plain, non-clickable slide.
 */
export function activeCampaigns(
  campaigns: PromoCampaign[] | undefined | null,
  now: Date = new Date(),
): PromoCampaign[] {
  const nowMs = now.getTime();
  return (campaigns ?? [])
    .filter(
      (c) =>
        inWindow(c, nowMs) &&
        safeMediaUrl(c.media_url) !== null &&
        c.title.trim() !== '' &&
        c.alt_text.trim() !== '',
    )
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id))
    .slice(0, MAX_CAMPAIGNS);
}
