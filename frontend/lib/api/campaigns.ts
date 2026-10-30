import { api } from './client';

/** An organiser writing to people who already bought from them. Email only for now. */

export type CampaignSegment = 'all' | 'repeat' | 'recent' | 'event' | 'custom';

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
  /** Where this organiser has events — the choices for a city rule. */
  cities: string[];
  /** Whether a campaign can go out on WhatsApp right now (the key is connected). */
  whatsapp_available?: boolean;
  /** Of everybody who bought, how many opted in to WhatsApp with a number. */
  whatsapp_reach?: number;
};

export type CampaignChannel = 'email' | 'whatsapp';

export const fetchCampaignOverview = () =>
  api.get<CampaignOverview>('/organizer/campaigns/overview');

/** A rule-built audience: the rules (already in API shape) and how to combine them. */
export type CustomAudience = { rules: Record<string, unknown>[]; match: 'all' | 'any' };

export const previewCampaign = (
  segment: CampaignSegment,
  eventId?: string,
  custom?: CustomAudience,
) =>
  api.post<{ recipients: number; whatsapp_recipients?: number }>('/organizer/campaigns', {
    segment,
    preview: true,
    ...(eventId ? { event_id: eventId } : {}),
    ...(custom ? { rules: custom.rules, match: custom.match } : {}),
  });

export const sendCampaign = (input: {
  segment: CampaignSegment;
  subject: string;
  message: string;
  eventId?: string;
  custom?: CustomAudience;
  channels?: CampaignChannel[];
}) =>
  api.post<{ sent: number; failed: number; whatsapp_sent?: number }>('/organizer/campaigns', {
    segment: input.segment,
    channels: input.channels ?? ['email'],
    subject: input.subject,
    message: input.message,
    ...(input.eventId ? { event_id: input.eventId } : {}),
    ...(input.custom ? { rules: input.custom.rules, match: input.custom.match } : {}),
  });

export type CampaignHistoryRow = {
  id: string;
  sent_at: string;
  subject: string;
  message_preview: string;
  segment: CampaignSegment | '';
  event_id: string | null;
  /** For a rule-built audience: how the rules combined, and each rule in plain words. */
  match?: 'all' | 'any' | '';
  rules?: string[];
  recipients: number;
  sent: number;
  failed: number;
  channels?: CampaignChannel[];
  whatsapp_sent?: number;
};

/** What this organiser has already sent, newest first. */
export const fetchCampaignHistory = () =>
  api.get<{ data: CampaignHistoryRow[] }>('/organizer/campaigns/history').then((r) => r.data);
