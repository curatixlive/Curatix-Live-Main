import { api } from './client';

/** What an organiser follows up on one event: the waiting list and unfinished payments. */

export type WaitlistRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  quantity: number;
  joined_at: string;
  notified_at: string | null;
};

export type WaitlistResult = {
  data: WaitlistRow[];
  meta: { count: number; tickets_wanted: number };
};

export const fetchEventWaitlist = (eventId: string) =>
  api.get<WaitlistResult>(`/organizer/events/${encodeURIComponent(eventId)}/waitlist`);

export type FailedPaymentRow = {
  booking_id: string;
  name: string;
  email: string;
  phone: string;
  tickets: number;
  amount_minor: number;
  status: string;
  attempted_at: string;
};

export const fetchFailedPayments = (eventId: string) =>
  api.get<{ data: FailedPaymentRow[]; meta: { count: number } }>(
    `/organizer/events/${encodeURIComponent(eventId)}/payment-failures`,
  );

/** Email a reminder to the chosen buyers, or to all of them when no ids are given. */
export const sendPaymentReminders = (eventId: string, bookingIds?: string[]) =>
  api.post<{ sent: number; skipped: number }>(
    `/organizer/events/${encodeURIComponent(eventId)}/payment-failures`,
    bookingIds ? { booking_ids: bookingIds } : {},
  );
