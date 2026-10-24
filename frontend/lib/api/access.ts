import { api } from './client';

/**
 * Does this person get early or invited access to an event?
 *
 * `POST /events/{id}/access` answers `{granted, via, invite_only}` and never
 * echoes the code. `via` is `code`, `follower` or `attendee`. The booking itself
 * re-decides on the server — this only lets the page show the right buttons.
 */
export type AccessAnswer = {
  granted: boolean;
  via: '' | 'code' | 'follower' | 'attendee';
  invite_only: boolean;
};

export const checkAccess = (eventId: string, code: string) =>
  api.post<AccessAnswer>(`/events/${encodeURIComponent(eventId)}/access`, code ? { code } : {});
