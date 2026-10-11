# Homepage ads hero — what the backend must add

The frontend is built and tested; it renders nothing until the backend serves campaigns.
`components/discovery/promo-hero.tsx` + `lib/discovery/promo.ts` consume the contract below.
No file under `backend/` was changed for this.

## What exists today (and is used)
- `GET /homepage` → hero **copy**, categories, featured cities, popular searches, and `collections`
  (`featured`, `trending`, `editors_pick`, `recommended`, `new`) — event cards an operator pinned.
  The homepage now renders `editors_pick`, `recommended` and `new` as rails (each hidden when empty).

## What is missing (Phase-3 backend work)
1. **A campaign model + admin CRUD.** Nothing stores an advertisement. Needed fields — exactly the
   frontend's `PromoCampaign` type in `lib/api/cms.ts`:
   `id, kind ('image'|'video'), media_url, mobile_media_url?, poster_url?, alt_text (required),
   title, description?, cta_label?, cta_href?, position, starts_at?, ends_at?`.
2. **Media upload for campaigns** (images, short video) through `core/uploads.py` with the same
   allow-list discipline as event media (no SVG); video needs a size cap and a poster frame.
3. **`campaigns` on `GET /homepage`**, already filtered to the active window and ordered by
   `position`, edge-cached with the rest of the payload and invalidated on admin writes.
4. **An admin screen** in the console (next to the homepage CMS) to create, schedule, reorder and
   preview campaigns.

## Frontend guarantees already in place
- Unsafe links (`javascript:`, `data:`, `//host`, plain http) are dropped; campaigns with no usable
  media, title or alt text are not shown; the schedule window is enforced client-side too.
- Auto-advance only for still images; stops on hover/focus/touch/offscreen/hidden tab; never under
  reduced motion; always a pause control. Video is muted with controls and never autoplays with sound,
  and does not autoplay at all under reduced motion or data-saver.

## Other desired homepage capabilities with no backend today
- Event **popularity/trending metrics** (the "Trending near you" rail is simply the soonest events;
  it makes no popularity claim).
- A `sort=newest` / "recently added" query for events.
- **Venue/restaurant partner** onboarding and **sponsored-placement** enquiries (the Partner section
  routes brands and venues to `/contact`).
