import type { CommissionKind, PartnerPromotion } from '@/lib/api/partner-promotions';

/** The shareable URL. Event-scoped links land on the event; organisation-wide ones on the home page. */
export function partnerLinkUrl(
  origin: string,
  promotion: Pick<PartnerPromotion, 'code' | 'event_id'>,
) {
  const path = promotion.event_id ? `/events/${promotion.event_id}` : '/';
  return `${origin}${path}?ref=${encodeURIComponent(promotion.code)}`;
}

/** "10% of ticket revenue" / "₹30 per ticket". Percent is stored in basis points. */
export function describeCommission(
  kind: CommissionKind,
  value: number,
  money: (minor: number) => string,
): string {
  if (kind === 'percent') return `${value / 100}% of ticket revenue`;
  return `${money(value)} per ticket`;
}

export type PartnerDraft = {
  name: string;
  partner: string;
  code: string;
  kind: CommissionKind;
  /** What the organizer typed: a percent (10) or rupees (30). */
  amount: string;
  windowDays: string;
  eventId: string;
};

export type PartnerIssues = Partial<Record<'name' | 'code' | 'amount' | 'windowDays', string>>;

/** Client-side mirror of the server's rules, for fast feedback. The server remains the authority. */
export function validatePartnerDraft(draft: PartnerDraft): PartnerIssues {
  const issues: PartnerIssues = {};
  if (!draft.name.trim()) issues.name = 'Give the promotion a name.';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(draft.code.trim()))
    issues.code = 'Use 3–32 letters, numbers, dashes or underscores.';
  // Commission is OPTIONAL: an empty field makes a tracking-only link. If
  // something is typed it has to be a sensible number.
  if (draft.amount.trim()) {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount < 0)
      issues.amount = 'Enter a number, or leave it empty.';
    else if (draft.kind === 'percent' && amount > 50)
      issues.amount = 'Commission cannot exceed 50%.';
  }
  const days = Number(draft.windowDays);
  if (!Number.isInteger(days) || days < 1 || days > 90)
    issues.windowDays = 'Choose between 1 and 90 days.';
  return issues;
}

/** Convert what was typed into what the API stores (basis points / paise). */
export function toCommissionValue(_kind: CommissionKind, amount: string): number {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : 0; // percent -> basis points, rupees -> paise: both x100
}
