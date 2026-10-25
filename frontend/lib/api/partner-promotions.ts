import { api } from './client';

/**
 * Influencer / partner promotions — a trackable link and the commission it
 * earns. Distinct from `coupons.ts` (a discount the CUSTOMER types): a partner
 * link gives the customer nothing and credits the partner.
 *
 * Money is minor units; `commission_value` is basis points for `percent` and
 * minor units per ticket for `fixed_per_ticket`.
 */

export type CommissionKind = 'percent' | 'fixed_per_ticket';
export type PromotionStatus = 'active' | 'paused' | 'completed';

export type PromotionStats = {
  clicks: number;
  unique_visitors: number;
  checkout_starts: number;
  bookings: number;
  tickets: number;
  gross_minor: number;
  refunded_minor: number;
  net_eligible_minor: number;
  failed_payments: number;
  commission_accrued_minor: number;
  commission_paid_minor: number;
  commission_payable_minor: number;
  /** Not measured — null, never 0. */
  page_visits: number | null;
};

export type PartnerPromotion = {
  id: string;
  name: string;
  partner_name: string;
  code: string;
  event_id: string | null;
  commission_kind: CommissionKind;
  commission_value: number;
  attribution_window_days: number;
  starts_at: string | null;
  ends_at: string | null;
  status: PromotionStatus;
  created_at: string;
  stats?: PromotionStats;
};

export type PartnerPromotionInput = {
  name: string;
  partner_name?: string;
  code: string;
  event_id?: string | null;
  commission_kind: CommissionKind;
  commission_value: number;
  attribution_window_days?: number;
  starts_at?: string | null;
  ends_at?: string | null;
};

export async function fetchPartnerPromotions(
  organizationId: string,
  range?: { since?: string; until?: string },
): Promise<PartnerPromotion[]> {
  const params = new URLSearchParams();
  if (range?.since) params.set('since', range.since);
  if (range?.until) params.set('until', range.until);
  const qs = params.toString();
  const res = await api.get<{ data: PartnerPromotion[] }>(
    `/organizations/${organizationId}/promotions${qs ? `?${qs}` : ''}`,
  );
  return res.data;
}

export function createPartnerPromotion(organizationId: string, input: PartnerPromotionInput) {
  return api.post<PartnerPromotion>(`/organizations/${organizationId}/promotions`, input);
}

export function updatePartnerPromotion(
  organizationId: string,
  id: string,
  patch: Partial<Omit<PartnerPromotionInput, 'code' | 'event_id'>> & { status?: PromotionStatus },
) {
  return api.patch<PartnerPromotion>(`/organizations/${organizationId}/promotions/${id}`, patch);
}

export function recordPartnerPayout(
  organizationId: string,
  id: string,
  input: { amount_minor: number; reference?: string },
) {
  return api.post<{ id: string }>(
    `/organizations/${organizationId}/promotions/${id}/payouts`,
    input,
  );
}

/** Public: count a link opening. Never throws — tracking must not break a page. */
export async function recordPromotionClick(code: string): Promise<void> {
  try {
    await api.post('/promotions/click', { code }, { auth: false });
  } catch {
    /* a lost click is a lost count, not an error worth showing */
  }
}

/** Credit the caller's reserved booking to the link they came through. Best effort. */
export async function attributeBooking(
  bookingId: string,
  code: string,
  clickedAt: string,
): Promise<void> {
  try {
    await api.post(`/bookings/${bookingId}/promotion`, { code, clicked_at: clickedAt });
  } catch {
    /* an expired/paused link simply earns nothing; the purchase is unaffected */
  }
}
