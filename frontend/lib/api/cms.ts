import { api } from './client';

/**
 * Admin-authored homepage content and platform announcements.
 *
 * ── WHY THESE ARE FETCHED ON THE SERVER ───────────────────────────────────
 *
 * `GET /homepage` and `GET /announcements` are PUBLIC, identical for everyone
 * in a city scope, and carry `s-maxage` + `stale-while-revalidate`. That makes
 * them exactly the wrong thing to fetch from the browser: doing so would put a
 * round trip in front of the hero — the LCP element on the busiest page on the
 * platform — for content that is the same for every visitor.
 *
 * So they are read during the server render with an ISR window matched to the
 * backend's own `s-maxage`. The copy is in the HTML; there is no spinner, no
 * layout shift, and a CDN absorbs the load.
 *
 * ── WHY THERE ARE NO FALLBACK CONSTANTS HERE ──────────────────────────────
 *
 * The defaults live in a DATA MIGRATION (`cms/0002_seed_defaults`), not in
 * this file. A hardcoded fallback headline would be exactly the thing the CMS
 * exists to remove: copy an operator cannot edit, silently winning whenever
 * the network hiccups. If the request fails the page renders without the
 * optional chrome rather than with stale invented copy — see `getHomepageSafe`.
 */

/** Matches the backend's `s-maxage` on `/homepage`. */
export const HOMEPAGE_REVALIDATE_SECONDS = 60;

export type HomepageCard = {
  entry_id: string;
  id: string;
  /**
   * The readable half of `/events/{slug}-{id}`, so a curated front-page link is
   * the CANONICAL URL rather than a bare-uuid one that immediately 308s — a
   * redirect on the most-clicked links on the site.
   *
   * Optional for the same reason it is on `EventCard`: this frontend must
   * typecheck and deploy against a backend that has not shipped the column,
   * and `eventPath()` falls back to the bare-id URL.
   */
  slug?: string;
  title: string;
  venue: string;
  city: string;
  starts_at: string;
  poster_url: string;
  from_price: number | null;
  tickets_available: number | null;
  organization_id: string;
  organization_name: string;
};

export type CollectionKey = 'featured' | 'trending' | 'editors_pick' | 'recommended' | 'new';

export type HomepageCategory = {
  id: string;
  slug: string;
  label: string;
  /** A lucide icon NAME, resolved against a bundled allow-list on the client. */
  icon: string;
  search_term: string;
};

/** A city the operator promotes on the front page. */
export type HomepageFeaturedCity = {
  id: string;
  name: string;
  image_url: string;
};

/**
 * A suggested search for the panel's empty state.
 *
 * `label` is what the chip says; `query` is what pressing it searches. They
 * differ on purpose — a chip can read "Comedy nights" while querying the stem
 * that actually matches rows.
 */
export type HomepagePopularSearch = {
  id: string;
  label: string;
  query: string;
};

/**
 * A promotional campaign for the homepage hero — an ADVERTISEMENT, not an event.
 *
 * Served by `GET /homepage` as `campaigns` — ONLY published, approved rows
 * inside their start/end window (the backend never serialises a draft, an
 * archived row or one scheduled for later). The frontend re-checks the window
 * anyway (`lib/discovery/promo.ts`): the response may sit in an edge cache.
 * With none published, the homepage shows the Curatix brand hero instead.
 *
 * It is deliberately NOT an `Event`: a campaign may point at an event (via
 * `cta_href`) but has no price, inventory or date of its own.
 */
export type PromoCampaign = {
  id: string;
  kind: 'image' | 'video';
  /** Image URL, or the video file URL for `kind: 'video'`. */
  media_url: string;
  /** Optional narrower crop served to phones. */
  mobile_media_url?: string;
  /** A still shown before a video loads, and to reduced-motion/data-saver viewers. */
  poster_url?: string;
  /** Describes the artwork for a screen reader. Required, like event alt text. */
  alt_text: string;
  title: string;
  description?: string;
  cta_label?: string;
  /** A path on this site, or an https URL. Validated before use. */
  cta_href?: string;
  /** Lower first. */
  position?: number;
  starts_at?: string | null;
  ends_at?: string | null;
};

/** A previous-event video an operator chose to show on the homepage. */
export type HomepageHighlight = {
  id: string;
  position: number;
  event: {
    id: string;
    slug?: string;
    title: string;
    venue: string;
    city: string;
    starts_at: string;
    poster_url: string;
  };
  video: {
    /** The embed URL the backend BUILT from the organiser's pasted link. */
    embed_url: string;
    is_vertical: boolean;
    caption: string;
  };
};

/** One homepage section's configuration, as the public page receives it. */
export type HomepageSectionConfig = {
  key: string;
  visible: boolean;
  position: number;
  settings: Record<string, boolean | number>;
};

export type Homepage = {
  /** Every registered section — visibility, order and behaviour. Absent from an
   *  older backend, in which case the page uses its defaults. */
  sections?: HomepageSectionConfig[];
  /** Admin-managed advertisements — published and in window only. */
  campaigns?: PromoCampaign[];
  /** Curated previous-event videos. */
  highlights?: HomepageHighlight[];
  hero: {
    headline: string;
    description: string;
    primary_cta: string;
    secondary_cta: string;
    search_placeholder: string;
    trust_badges: string[];
  };
  ribbon: { enabled: boolean; text: string };
  footer_note: string;
  categories: HomepageCategory[];
  /** Curation, NOT the platform's city list — every city with an event is
      already searchable and already has a landing page. */
  featured_cities: HomepageFeaturedCity[];
  popular_searches: HomepagePopularSearch[];
  collections: Record<CollectionKey, HomepageCard[]>;
  version: number;
  generated_at: string;
};

/** Tag on the homepage fetch, so an admin's save can purge it at once
 *  (`app/api/revalidate-homepage`) instead of waiting out the revalidate window. */
export const HOMEPAGE_CACHE_TAG = 'homepage';

export function fetchHomepage(city?: string): Promise<Homepage> {
  const query = city ? `?city=${encodeURIComponent(city)}` : '';
  return api.get<Homepage>(`/homepage${query}`, {
    auth: false,
    next: { revalidate: HOMEPAGE_REVALIDATE_SECONDS, tags: [HOMEPAGE_CACHE_TAG] },
  });
}

/**
 * The homepage must render even if the CMS request fails.
 *
 * Returns `null` rather than invented content, so callers fall back to
 * rendering without the admin-managed chrome — a front page missing its
 * ribbon is a much smaller failure than one showing copy nobody wrote.
 */
export async function fetchHomepageSafe(city?: string): Promise<Homepage | null> {
  try {
    return await fetchHomepage(city);
  } catch {
    return null;
  }
}

export type AnnouncementKind = 'maintenance' | 'feature' | 'promotion' | 'emergency';

export type LiveAnnouncement = {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  /** Always a same-origin path — the backend refuses anything else. */
  link_path: string;
  link_label: string;
  dismissible: boolean;
};

export type Placement = 'home' | 'organizer' | 'admin';

export async function fetchAnnouncementsSafe(
  placement: Placement = 'home',
): Promise<LiveAnnouncement[]> {
  try {
    const body = await api.get<{ data: LiveAnnouncement[] }>(
      `/announcements?placement=${placement}`,
      placement === 'home'
        ? { auth: false, next: { revalidate: HOMEPAGE_REVALIDATE_SECONDS } }
        : undefined,
    );
    return body.data;
  } catch {
    // A banner that fails to load is not worth failing a page over.
    return [];
  }
}

/* ───────────────────────────── admin writes ───────────────────────────── */

/**
 * The EDITOR's read — deliberately not `fetchHomepage`.
 *
 * `GET /homepage` is cached for ten minutes and served from the edge, which
 * means its `version` is a cached number. Seeding the optimistic lock from
 * there sends a stale version and 409s on every save, so the operator sees
 * "someone else edited this" forever and nothing they type can be saved.
 * This read is uncached and staff-only.
 */
export type HomepageDraft = {
  version: number;
  hero_headline: string;
  hero_description: string;
  hero_primary_cta: string;
  hero_secondary_cta: string;
  search_placeholder: string;
  ribbon_text: string;
  ribbon_enabled: boolean;
  trust_badges: string[];
  footer_note: string;
};

export const fetchHomepageDraft = () => api.get<HomepageDraft>('/admin/homepage');

export type UpdateHomepageInput = {
  version: number;
  hero_headline?: string;
  hero_description?: string;
  hero_primary_cta?: string;
  hero_secondary_cta?: string;
  search_placeholder?: string;
  ribbon_text?: string;
  ribbon_enabled?: boolean;
  trust_badges?: string[];
  footer_note?: string;
};

export const updateHomepage = (input: UpdateHomepageInput) =>
  api.patch<{ version: number }>('/admin/homepage', input);

export type AdminFeatured = {
  id: string;
  collection: CollectionKey;
  position: number;
  city: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  event_id: string;
  event_title: string;
  event_status: string;
  event_starts_at: string;
};

export const fetchAdminFeatured = () =>
  api.get<{ data: AdminFeatured[] }>('/admin/homepage/featured');

export const featureEvent = (input: {
  event_id: string;
  collection: CollectionKey;
  position?: number;
  city?: string;
  starts_at?: string | null;
  ends_at?: string | null;
}) => api.post<{ id: string }>('/admin/homepage/featured', input);

export const unfeature = (entryId: string) =>
  api.delete<void>(`/admin/homepage/featured/${encodeURIComponent(entryId)}`);

export const reorderFeatured = (order: { id: string; position: number }[]) =>
  api.post<{ ok: boolean }>('/admin/homepage/featured/reorder', { order });

export type AdminCategory = HomepageCategory & {
  position: number;
  is_visible: boolean;
  archived_at: string | null;
};

export const fetchAdminCategories = () => api.get<{ data: AdminCategory[] }>('/admin/categories');

export const createCategory = (input: {
  slug: string;
  label: string;
  icon?: string;
  search_term?: string;
  position?: number;
  is_visible?: boolean;
}) => api.post<AdminCategory>('/admin/categories', input);

export const updateCategory = (
  categoryId: string,
  input: Partial<Omit<AdminCategory, 'id' | 'slug' | 'archived_at'>>,
) => api.patch<AdminCategory>(`/admin/categories/${encodeURIComponent(categoryId)}`, input);

/** Archives — a linked landing page keeps resolving. */
export const archiveCategory = (categoryId: string) =>
  api.delete<void>(`/admin/categories/${encodeURIComponent(categoryId)}`);

export type AdminAnnouncement = {
  id: string;
  kind: AnnouncementKind;
  placement: Placement | 'all';
  title: string;
  body: string;
  link_path: string;
  link_label: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  dismissible: boolean;
  created_at: string;
  updated_at: string;
};

export const fetchAdminAnnouncements = () =>
  api.get<{ data: AdminAnnouncement[] }>('/admin/announcements');

export const createAnnouncement = (input: Partial<AdminAnnouncement>) =>
  api.post<AdminAnnouncement>('/admin/announcements', input);

export const updateAnnouncement = (id: string, input: Partial<AdminAnnouncement>) =>
  api.patch<AdminAnnouncement>(`/admin/announcements/${encodeURIComponent(id)}`, input);

export const deleteAnnouncement = (id: string) =>
  api.delete<void>(`/admin/announcements/${encodeURIComponent(id)}`);

/* -------------------------------------------------------------------------- */
/* Curated discovery lists                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Featured cities and popular searches.
 *
 * Both are CURATION, not derived data. Featured cities are not the platform's
 * city list — every city with an event is already searchable — they are the
 * handful shown on the front page. "Popular" searches are what an operator
 * wants to point people at; there is no query log, and a number invented from
 * nothing is what this codebase refuses to display.
 */

export type AdminFeaturedCity = {
  id: string;
  name: string;
  image_url: string;
  position: number;
  is_visible: boolean;
  created_at: string;
};

export type AdminPopularSearch = {
  id: string;
  label: string;
  /** What pressing the chip searches for — deliberately separate from `label`. */
  query: string;
  position: number;
  is_visible: boolean;
  created_at: string;
};

export const fetchAdminFeaturedCities = () =>
  api.get<{ data: AdminFeaturedCity[] }>('/admin/featured-cities');

export const createFeaturedCity = (input: {
  name: string;
  image_url?: string;
  position?: number;
  is_visible?: boolean;
}) => api.post<AdminFeaturedCity>('/admin/featured-cities', input);

export const updateFeaturedCity = (
  cityId: string,
  input: Partial<Omit<AdminFeaturedCity, 'id' | 'created_at'>>,
) => api.patch<AdminFeaturedCity>(`/admin/featured-cities/${encodeURIComponent(cityId)}`, input);

export const deleteFeaturedCity = (cityId: string) =>
  api.delete<void>(`/admin/featured-cities/${encodeURIComponent(cityId)}`);

export const fetchAdminPopularSearches = () =>
  api.get<{ data: AdminPopularSearch[] }>('/admin/popular-searches');

export const createPopularSearch = (input: {
  label: string;
  query: string;
  position?: number;
  is_visible?: boolean;
}) => api.post<AdminPopularSearch>('/admin/popular-searches', input);

export const updatePopularSearch = (
  searchId: string,
  input: Partial<Omit<AdminPopularSearch, 'id' | 'created_at'>>,
) =>
  api.patch<AdminPopularSearch>(`/admin/popular-searches/${encodeURIComponent(searchId)}`, input);

export const deletePopularSearch = (searchId: string) =>
  api.delete<void>(`/admin/popular-searches/${encodeURIComponent(searchId)}`);

/* -------------------------------------------------------------------------- */
/* Hero advertisements and past-event highlights (admin)                       */
/* -------------------------------------------------------------------------- */

export type CampaignStatus = 'draft' | 'published' | 'archived';

export type AdminCampaign = {
  id: string;
  kind: 'image' | 'video';
  title: string;
  description: string;
  alt_text: string;
  media_url: string;
  mobile_media_url: string;
  poster_url: string;
  cta_label: string;
  cta_href: string;
  position: number;
  status: CampaignStatus;
  starts_at: string | null;
  ends_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignInput = Partial<
  Pick<
    AdminCampaign,
    | 'kind'
    | 'title'
    | 'description'
    | 'alt_text'
    | 'media_url'
    | 'mobile_media_url'
    | 'poster_url'
    | 'cta_label'
    | 'cta_href'
    | 'position'
    | 'starts_at'
    | 'ends_at'
  >
>;

export const fetchAdminCampaigns = () => api.get<{ data: AdminCampaign[] }>('/admin/campaigns');

export const createCampaign = (input: CampaignInput & { title: string }) =>
  api.post<AdminCampaign>('/admin/campaigns', input);

export const updateCampaign = (id: string, input: CampaignInput) =>
  api.patch<AdminCampaign>(`/admin/campaigns/${encodeURIComponent(id)}`, input);

/** Publishing IS the approval: it records who and when, and re-checks the row. */
export const publishCampaign = (id: string) =>
  api.post<AdminCampaign>(`/admin/campaigns/${encodeURIComponent(id)}/publish`);

export const unpublishCampaign = (id: string) =>
  api.delete<AdminCampaign>(`/admin/campaigns/${encodeURIComponent(id)}/publish`);

/** Archives; the row is kept for the audit trail and never served. */
export const archiveCampaign = (id: string) =>
  api.delete<void>(`/admin/campaigns/${encodeURIComponent(id)}`);

export const reorderCampaigns = (order: { id: string; position: number }[]) =>
  api.post<{ ok: boolean }>('/admin/campaigns/reorder', { order });

/** Image only. Validated for size, type, magic bytes and shape before storage. */
export function uploadCampaignImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  return api.post<{ url: string }>('/admin/campaigns/media', form);
}

export type AdminHighlight = {
  id: string;
  position: number;
  event_id: string;
  event_title: string;
  event_starts_at: string;
  media_id: string;
  embed_url: string;
  caption: string;
};

export type HighlightCandidate = {
  media_id: string;
  event_id: string;
  event_title: string;
  event_starts_at: string;
  embed_url: string;
  caption: string;
};

export const fetchAdminHighlights = () => api.get<{ data: AdminHighlight[] }>('/admin/highlights');

export const fetchHighlightCandidates = () =>
  api.get<{ data: HighlightCandidate[] }>('/admin/highlights/candidates');

export const addHighlight = (mediaId: string, position = 0) =>
  api.post<{ id: string }>('/admin/highlights', { media_id: mediaId, position });

export const removeHighlight = (id: string) =>
  api.delete<void>(`/admin/highlights/${encodeURIComponent(id)}`);

export const reorderHighlights = (order: { id: string; position: number }[]) =>
  api.post<{ ok: boolean }>('/admin/highlights/reorder', { order });

/* -------------------------------------------------------------------------- */
/* Homepage sections (admin)                                                   */
/* -------------------------------------------------------------------------- */

export type SectionSettingSchema = {
  key: string;
  kind: 'bool' | 'int';
  label: string;
  help: string;
  min: number | null;
  max: number | null;
  default: boolean | number;
};

export type AdminSection = {
  key: string;
  label: string;
  description: string;
  visible: boolean;
  position: number;
  settings: Record<string, boolean | number>;
  settings_schema: SectionSettingSchema[];
};

export const fetchAdminSections = () =>
  api.get<{ data: AdminSection[] }>('/admin/homepage/sections');

/** One section's switch and/or settings. A targeted write — two operators on
 *  different sections cannot overwrite each other. */
export const updateSection = (
  key: string,
  input: { visible?: boolean; settings?: Record<string, boolean | number> },
) => api.patch<AdminSection>(`/admin/homepage/sections/${encodeURIComponent(key)}`, input);

export const reorderSections = (order: string[]) =>
  api.put<{ data: AdminSection[] }>('/admin/homepage/sections/order', { order });
