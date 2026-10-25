import { api } from './client';
import type { FeeSchedule } from '@/lib/booking/selection';

/** The buyer's per-ticket fee: the platform default and the admin's overrides. */

export type FeeOverride = FeeSchedule & {
  scope: 'event' | 'organization';
  id: string;
  name: string;
  updated_at: string;
};

export type FeesOverview = { default: FeeSchedule; overrides: FeeOverride[] };

export const fetchFees = () => api.get<FeesOverview>('/admin/fees');

export const setDefaultFees = (values: FeeSchedule) => api.put<FeeSchedule>('/admin/fees', values);

const overridePath = (scope: 'event' | 'organization', id: string) =>
  `/admin/fees/${scope === 'event' ? 'events' : 'organizations'}/${encodeURIComponent(id)}`;

export const setFeeOverride = (scope: 'event' | 'organization', id: string, values: FeeSchedule) =>
  api.put<FeeSchedule>(overridePath(scope, id), values);

export const clearFeeOverride = (scope: 'event' | 'organization', id: string) =>
  api.delete<void>(overridePath(scope, id));

/** The schedule a new booking for this event would be priced with. Public. */
export const fetchEventFees = (eventId: string) =>
  api.get<FeeSchedule>(`/events/${encodeURIComponent(eventId)}/fees`);
