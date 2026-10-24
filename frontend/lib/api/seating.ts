import { api } from './client';

/**
 * Assigned seating: venue layouts (reusable by any organiser at that venue),
 * and the per-event seat map a buyer chooses from.
 */

export type LayoutSection = { id: string; name: string };

export type VenueLayout = {
  id: string;
  name: string;
  venue: string;
  city: string;
  rows: number;
  cols: number;
  sections: LayoutSection[];
  /** rows x cols; a section id, or null for an aisle / gap. */
  grid: (string | null)[][];
  seat_count: number;
  created_at: string;
};

export type NewLayout = {
  venue: string;
  city: string;
  place_id?: string;
  name: string;
  rows: number;
  cols: number;
  sections: LayoutSection[];
  grid: (string | null)[][];
};

export const fetchVenueLayouts = (venue: string, city: string, placeId = '') =>
  api
    .get<{
      data: VenueLayout[];
    }>(
      `/seating/layouts?venue=${encodeURIComponent(venue)}&city=${encodeURIComponent(city)}${placeId ? `&place_id=${encodeURIComponent(placeId)}` : ''}`,
    )
    .then((response) => response.data);

export const createVenueLayout = (layout: NewLayout) =>
  api.post<VenueLayout>('/seating/layouts', layout);

export type SeatStatus = 'available' | 'held' | 'sold';

export type SeatSection = {
  id: string;
  name: string;
  ticket_type_id: string;
  price_minor: number;
  /** Display only: what each declared gender pays in this section, when it differs. */
  gender_prices?: { male?: number; female?: number };
  total: number;
  available: number;
};

export type Seat = {
  id: string;
  label: string;
  row: number;
  col: number;
  section_id: string;
  status: SeatStatus;
};

export type SeatMap = {
  event_id: string;
  rows: number;
  cols: number;
  max_per_booking: number;
  sections: SeatSection[];
  seats: Seat[];
};

/** Live availability — never cached. A 404 means the event has no seating. */
export const fetchSeatMap = (eventId: string) =>
  api.get<SeatMap>(`/events/${encodeURIComponent(eventId)}/seating`);

export const enableEventSeating = (
  eventId: string,
  layoutId: string,
  prices: { section_id: string; price_minor: number }[],
) =>
  api.put<SeatMap>(`/events/${encodeURIComponent(eventId)}/seating`, {
    layout_id: layoutId,
    prices,
  });

export const disableEventSeating = (eventId: string) =>
  api.delete<void>(`/events/${encodeURIComponent(eventId)}/seating`);
