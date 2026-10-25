# Implementation progress — organizer experience spec

Source: the long "Complete Organizer Experience" brief (dashboard, event creation,
analytics funnel, promotions, communities, community-only events, verified
reviews + follow-up email). Work happens in the existing app; nothing is rebuilt.

## Audit (25 Oct) — what already exists vs. what is missing

| Area | State |
|---|---|
| Event creation (single-page wizard, autosave, checklist, validation) | EXISTS, hardened this week (see ORGANIZER_UX_PRIORITIES.md) |
| Event analytics (views, impressions, CTR, funnel, price/feature history) | EXISTS (`apps/events/engagement.py`, organizer analytics page) |
| Organizer dashboard (attention list, earnings, funnel list, payouts, refunds, activity feed) | EXISTS |
| Coupons (organizer-funded) | EXISTS — NOT influencer attribution |
| Follow / unfollow an organisation, `GET /me/following` | EXISTS (`OrganizationFollow`) |
| Verified reviews (`apps/reviews`, `EventReview`) | EXISTS; in-app prompt only |
| Post-event review EMAIL | MISSING — `reviews/tasks.py` records a prior decision *against* it; the brief now requires it |
| Promotions: influencer links, click tracking, commission | MISSING |
| Public organiser community page (portfolio, follow, reviews, events) | MISSING (only `/organizer` marketing page) |
| Community-only / early-access events | MISSING (invite-only + access code exist and are the nearest seam) |

## Order of work

1. DONE (committed, NOT deployed) Promotions backend `apps/promotions`.
2. DONE (committed, NOT deployed) Partner links panel inside the existing Promotions page; `?ref=` capture; attribution after reserve.
3. Post-event review email (scheduled, deduped through the notification ledger).
4. Public community page + follow control on event page.
5. Community-only / early-access events (backend-enforced).
6. Dashboard additions that need the above (promotion + community cards).

## Rules for this work
- Never claim commission "paid" without a payout record.
- Commission is computed from paid bookings only, minus refunds; reversible and auditable.
- No fabricated stats; absent data is `null`, not 0.
- Each module follows `apps/accounts` shape and CLAUDE.md layering.

## Log
- 25 Oct: `apps/promotions` — models (Promotion, PromotionClick, PromotionAttribution, PromotionPayout),
  migration `promotions.0001_initial` (NEW TABLES ONLY, no existing table touched), service, API,
  `config/di.build_promotion_service`. Commission derived from PAID bookings less refunds; payouts are
  records the organizer enters and cannot exceed what is owed (row-locked).
  Tests: 30 backend tests (`apps/promotions/tests`), 8 frontend. Full frontend suite 1638 pass; backend
  promotions+booking+payments+coupons 479 pass; ruff/mypy/makemigrations clean.
- Frontend: `lib/api/partner-promotions.ts`, `lib/promotions/ref.ts`, `components/analytics/promotion-ref.tsx`
  (mounted in the public layout), attribution call in `step-review.tsx` after the hold exists,
  `components/organizer/partner-links.tsx` rendered on `/dashboard/promotions`.

## Known gaps in item 1–2 (honest)
- Customer contact details / failed-payment customer list per promotion: NOT built (counts only).
- Event-page visits attributable to a link: NOT measured (shown as "Not measured").
- Eligible-ticket-type restriction, and the optional discount on a partner link: NOT built
  (use a coupon code alongside; they are independent).
- Not yet checked in a browser, locally or live.

## Deploy checklist for this increment
1. Migration `promotions.0001` is additive; run `migrate_safe` on production BEFORE pushing the backend.
2. Push to `curatix` main; verify `/dashboard/promotions` on the live site.

## Needs from the owner (no secrets here)
- Decide: commission payout is recorded manually by the organizer (no payout rail built).
- Decide: WhatsApp review follow-up stays off (no approved templates/credentials known).
