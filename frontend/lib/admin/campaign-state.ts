import type { AdminCampaign } from '@/lib/api/cms';

/**
 * What an advertisement is DOING right now, derived from its stored status and
 * its run window — never stored, because it changes with the clock.
 *
 * "published" alone does not mean "visible": a published ad scheduled for next
 * week is not on the site, and one whose run ended last night is not either. The
 * screen says which, so an operator never has to wonder why a "published" ad is
 * missing from the homepage.
 */
export type CampaignPhase = 'draft' | 'live' | 'scheduled' | 'ended';

export function campaignPhase(
  campaign: Pick<AdminCampaign, 'status' | 'starts_at' | 'ends_at'>,
  now: Date = new Date(),
): CampaignPhase {
  if (campaign.status !== 'published') return 'draft';
  const t = now.getTime();
  if (campaign.starts_at && t < Date.parse(campaign.starts_at)) return 'scheduled';
  if (campaign.ends_at && t >= Date.parse(campaign.ends_at)) return 'ended';
  return 'live';
}

/** `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm` in LOCAL time. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The inverse: a local input value to an ISO instant, or null when blank. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
