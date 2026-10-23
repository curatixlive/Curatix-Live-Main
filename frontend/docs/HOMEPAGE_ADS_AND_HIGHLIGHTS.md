# Homepage: hero advertisements, partner carousel and past-event videos

## What the homepage is, in order
| | Section | Source |
|---|---|---|
| A | **Hero**: published advertisements, or the Curatix brand hero when none are live | `GET /homepage` → `campaigns` |
| B | **Featured events**: what an operator featured in the CMS, else the soonest events | `GET /homepage` → `collections.featured`, else `GET /events` |
| C | **Find your next experience**: search, city, category, date, sort, "Load more" | `GET /events` (cursor pagination) |
| D | **Partner carousel**: organiser / venue partner / event sponsor | `lib/discovery/partner-cards.ts` |
| E | **Relive the highlights**: video from events that already happened | `GET /homepage` → `highlights` |

Below E the page continues as before: operator collections (hidden when empty), "Selling fast" (only when something genuinely is), Hire a band, Why Curatix, subscribe.

## Managing it (Admin → Homepage → Studio)
**Hero advertisements.** Create (image or video) → it is a DRAFT, invisible to the public → **Publish**. Publishing is the approval: it records who and when, and refuses an incomplete ad.
- Image: upload wide artwork (≥ 1200 px; 2400 × 1000 is ideal; ratio between 1.5:1 and 3:1). Optional narrower phone crop.
- Video: a direct **https `.mp4`/`.webm` link** plus a required **poster image**. It plays muted and loops; there are play and mute buttons. YouTube/Vimeo links cannot be used (they cannot autoplay silently as a banner). Video files are not uploaded through this screen.
- Required to publish: headline, alt text (for screen readers), media. A button needs both a label and a link (a site path or https URL).
- Optional schedule (start/end). A published ad scheduled for later, or already over, is not shown; the screen labels it Scheduled/Ended.
- Reorder with the arrows; **Take down** returns it to a draft; the bin archives it (kept for the audit trail, never served).

**Past-event videos.** Organisers attach a video (YouTube/Vimeo link) to their own event as before. In the Studio the operator picks from videos of events that have **already happened** (cancelled events excluded) and orders them. Nothing downloads until a visitor presses play.

## Security properties (each has a test)
- The public payload contains only published, in-window ads; never drafts, archived or scheduled-later rows. The window is evaluated **per request**, not frozen into the 10-minute cache.
- Only staff can read or write anything under `/admin/campaigns` and `/admin/highlights`.
- Links are allow-listed (site path or https; never `javascript:`, `data:`, `//host`, plain http), on the server **and** again in the browser.
- Image uploads are validated for size, declared type, magic bytes and shape before they reach storage; the filename is never used in the storage key.
- A highlight's iframe URL is rebuilt from a strict YouTube/Vimeo pattern at the point of use.

## API
| | |
|---|---|
| `GET /api/v1/homepage` (public, cached) | now includes `campaigns` and `highlights` |
| `GET/POST /api/v1/admin/campaigns` | list (any status except archived) / create a draft |
| `PATCH/DELETE /api/v1/admin/campaigns/{id}` | edit / archive |
| `POST/DELETE /api/v1/admin/campaigns/{id}/publish` | publish (approve) / take down |
| `POST /api/v1/admin/campaigns/reorder`, `POST /api/v1/admin/campaigns/media` | order / upload an image |
| `GET/POST /api/v1/admin/highlights`, `GET .../candidates`, `DELETE .../{id}`, `POST .../reorder` | curate past-event videos |

## Deployment
- **One migration:** `cms.0006_campaigns_and_highlights` (two new tables; nothing existing is altered). Run it with `manage.py migrate_safe` before the new code serves traffic.
- **No new environment variables.** Image uploads use the existing `STORAGE_BACKEND`. On production make sure the storage host is also the frontend's `NEXT_PUBLIC_MEDIA_BASE_URL` (see `DEPLOY_FREE_TIER.md`).

## Known limits
- Hero video is a link, not an upload.
- Venue and sponsor have no self-serve product: their pages (`/venue-partners`, `/sponsors`) are honest enquiry pages that open an email to `NEXT_PUBLIC_SUPPORT_EMAIL` (or `/contact` when unset).
- Events have no category column, so a category filter is a search stem (the existing interim). Price sorting reorders the events already loaded; only "Soonest" is a server sort.
- The previous-event video's thumbnail is the event poster, else YouTube's still; Vimeo has no cheap still, so it shows a gradient.
