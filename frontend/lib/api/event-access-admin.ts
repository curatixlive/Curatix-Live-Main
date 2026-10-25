import { api } from './client';

/** The host's side of access: emailing the code, and managing co-hosts of one event. */

export type InviteResult = { sent: string[]; skipped: string[] };

export const sendInvites = (eventId: string, emails: string[]) =>
  api.post<InviteResult>(`/events/${encodeURIComponent(eventId)}/invites`, { emails });

/** What a co-host may do on this ONE event. */
export type CoHostPermissions = {
  analytics: boolean;
  attendees: boolean;
  checkin: boolean;
  /** Revenue, refunds and payouts. Off by default. */
  finance: boolean;
  /** The purchases list for this event — buyer names and emails. Off by default. */
  bookings: boolean;
  /** Change the event's details. Never tickets, price, status or the access code. */
  edit: boolean;
};

export type CoHost = {
  id: string;
  user_id: string;
  email: string;
  name: string;
  permissions: CoHostPermissions;
  created_at: string;
};

const base = (eventId: string) => `/events/${encodeURIComponent(eventId)}/cohosts`;

export const fetchCoHosts = (eventId: string) =>
  api.get<{ data: CoHost[] }>(base(eventId)).then((page) => page.data);

export const addCoHost = (
  eventId: string,
  email: string,
  permissions?: Partial<CoHostPermissions>,
) => api.post<CoHost>(base(eventId), { email, ...(permissions ? { permissions } : {}) });

export const updateCoHost = (
  eventId: string,
  coHostId: string,
  permissions: Partial<CoHostPermissions>,
) => api.patch<CoHost>(`${base(eventId)}/${encodeURIComponent(coHostId)}`, { permissions });

export const removeCoHost = (eventId: string, coHostId: string) =>
  api.delete<void>(`${base(eventId)}/${encodeURIComponent(coHostId)}`);

/** Events somebody else lets me help run. */
export type CoHostedEvent = {
  event_id: string;
  title: string;
  status: string;
  starts_at: string;
  city: string;
  host: string;
  permissions: CoHostPermissions;
};

export const fetchCoHostedEvents = () =>
  api.get<{ data: CoHostedEvent[] }>('/organizer/cohosted-events').then((page) => page.data);

/** The wa.me share link for an invitation — the organiser sends it from their own WhatsApp. */
export function whatsappInviteUrl(title: string, eventUrl: string, code: string): string {
  const text = `You're invited to ${title}. Open ${eventUrl} and use access code ${code} at checkout.`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
