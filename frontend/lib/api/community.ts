import { api } from './client';
import type { EventCard as EventCardData } from './types';

/**
 * An organizer's public community page, and following them.
 *
 * The page read is public and edge-cached; follow state is per-person, private
 * and never part of it (a per-user field would either be served to the wrong
 * reader or fork one hot cache key into one per user).
 */

export type CommunityReview = {
  id: string;
  rating: number;
  body: string;
  verified_attendee: boolean;
  /** First name only. */
  reviewer: string;
  event_title: string;
  event_id: string;
  created_at: string;
};

export type CommunityHighlight = {
  id: string;
  url: string;
  alt: string;
  event_id: string;
  event_title: string;
};

export type CommunityMember = {
  id: string;
  name: string;
  role: string;
  details: string;
  photo_url: string;
  photo_alt: string;
};

export type ForumPost = {
  id: string;
  body: string;
  created_at: string;
  /** First name only. */
  author: string;
  is_organizer: boolean;
  reply_count: number;
};

export type ForumPage = { data: ForumPost[]; meta: { next: string | null } };

export type Community = {
  organization: {
    id: string;
    name: string;
    logo_url: string;
    cover_url: string;
    bio: string;
    verified_level: 'unverified' | 'pending' | 'verified';
    follower_count: number;
    member_since: string;
    events_count: number;
    socials: { instagram: string; youtube: string; x: string };
  };
  highlights: CommunityHighlight[];
  team: CommunityMember[];
  upcoming_events: EventCardData[];
  past_events: EventCardData[];
  reviews: {
    count: number;
    /** Null when nobody has reviewed — never 0. */
    average: number | null;
    distribution: Record<string, number>;
    latest: CommunityReview[];
  };
};

export type FollowState = {
  organization_id: string;
  is_following: boolean;
  notify: boolean;
  follower_count: number;
};

export function fetchCommunity(organizationId: string): Promise<Community> {
  return api.get<Community>(`/organizations/${encodeURIComponent(organizationId)}/community`, {
    auth: false,
    next: { revalidate: 60 },
  });
}

const followPath = (id: string) => `/organizations/${encodeURIComponent(id)}/follow`;

export const fetchFollowState = (id: string) => api.get<FollowState>(followPath(id));
export const followOrganization = (id: string) => api.post<FollowState>(followPath(id), {});
export const unfollowOrganization = (id: string) => api.delete<FollowState>(followPath(id));
export const setFollowNotify = (id: string, notify: boolean) =>
  api.patch<FollowState>(followPath(id), { notify });

export function fetchForum(organizationId: string, cursor?: string | null): Promise<ForumPage> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return api.get<ForumPage>(`/organizations/${encodeURIComponent(organizationId)}/forum${qs}`, {
    auth: false,
  });
}

export const fetchReplies = (postId: string) =>
  api.get<{ data: ForumPost[] }>(`/forum/${encodeURIComponent(postId)}/replies`, { auth: false });

export const createForumPost = (organizationId: string, body: string, parentId?: string) =>
  api.post<ForumPost>(`/organizations/${encodeURIComponent(organizationId)}/forum`, {
    body,
    ...(parentId ? { parent_id: parentId } : {}),
  });

export const removeForumPost = (postId: string) =>
  api.delete<void>(`/forum/${encodeURIComponent(postId)}`);

export type ForumMe = { can_moderate: boolean; my_post_ids: string[] };
export const fetchForumMe = (organizationId: string) =>
  api.get<ForumMe>(`/organizations/${encodeURIComponent(organizationId)}/forum/me`);
