import { api } from './client';

/** An organiser writing to people who already bought from them. Email only for now. */

export type CampaignSegment = 'all' | 'repeat' | 'recent' | 'event';

export type CampaignOverview = {
  audience: Record<'all' | 'repeat' | 'recent', number>;
  top_customers: {
    name: string;
    email: string;
    orders: number;
    lifetime_value_minor: number;
    last_booked_at: string | null;
  }[];
  venues: { venue: string; city: string; tickets: number; events: number; buyers: number }[];
};

export const fetchCampaignOverview = () =>
  api.get<CampaignOverview>('/organizer/campaigns/overview');

export const previewCampaign = (segment: CampaignSegment, eventId?: string) =>
  api.post<{ recipients: number }>('/organizer/campaigns', {
    segment,
    preview: true,
    ...(eventId ? { event_id: eventId } : {}),
  });

export const sendCampaign = (input: {
  segment: CampaignSegment;
  subject: string;
  message: string;
  eventId?: string;
}) =>
  api.post<{ sent: number; failed: number }>('/organizer/campaigns', {
    segment: input.segment,
    subject: input.subject,
    message: input.message,
    ...(input.eventId ? { event_id: input.eventId } : {}),
  });

export type CampaignHistoryRow = {
  id: string;
  sent_at: string;
  subject: string;
  message_preview: string;
  segment: CampaignSegment | '';
  event_id: string | null;
  recipients: number;
  sent: number;
  failed: number;
};

/** What this organiser has already sent, newest first. */
export const fetchCampaignHistory = () =>
  api.get<{ data: CampaignHistoryRow[] }>('/organizer/campaigns/history').then((r) => r.data);
