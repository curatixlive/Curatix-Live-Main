# Curatix — handoff

Everything needed to pick this project up cold: in a new Claude account, on a new
laptop, or by a new developer. It contains **no secret values** — only where each
one lives.

Last updated: 25 Oct 2026, at commit on `main` of
`github.com/curatixlive/Curatix-Live-Main`.

## 0. State at handoff (25 Oct 2026)

- **Commits:** nothing is left uncommitted that belongs in the repo. Everything is
  pushed to `curatix main` and deployed (Vercel + Render). The only untracked
  folder is `.claude/` (local Claude launch config — keep it out of git).
- **Migrations:** every migration in the repo has been applied to production
  (latest: `booking.0012_fee_policy`, `notifications.0014`). No migration is pending.
- **Tests at the last commit:**
  - Backend: all pass except the 5 `core/tests/test_redis_adapter.py` tests, which
    need a local Redis and fail on a laptop without one (expected).
  - Frontend unit tests: 1592 / 1592 pass.
  - Playwright e2e: all specs pass. On a busy laptop a few discovery specs
    (keyboard search, header layout) time out once and pass on retry — run them
    with nothing else using the machine.
  - GitHub Actions: `frontend-e2e` had two accessibility failures that are fixed
    in this commit (home rail dimming, offers strip keyboard access) — confirm
    the next run is green. `release` fails only at `publish` (AWS not configured,
    see §10); its test and security jobs pass.
- **Still to do by a person:** see §10 (payments to live mode, Google sign-in
  credentials, AWS decision, WhatsApp).
- **Before switching laptops or Claude accounts:** copy the git-ignored secret
  files listed in §7 into a password manager.

Read in this order: this file → `CLAUDE.md` (the binding engineering rules and
the reasoning behind every module) → `DEPLOYMENT.md` (the runbook) →
`ENVIRONMENT_VARIABLES.md` (every variable) → `PENDING_TASKS.md` and
`frontend/BACKLOG.md` (what is not built).

---

## 1. What Curatix is

An Indian event-ticketing platform plus a second product, **Hire a Band**.

- **Buyers** discover events, pick tickets (general admission, assigned seats,
  gender-priced tiers, pre-sale / invite-only), pay, and get signed QR tickets.
- **Organisers** create events, sell, check people in at the door, see analytics,
  run campaigns, manage a team, and get paid out after the event.
- **Platform admins** moderate events and organisers, set buyer fees, watch
  payments, refunds, settlements and platform health.
- **Performers** list acts; customers post briefs; acts quote; one wins.

---

## 2. Live system (pin to pin)

```
Browser / phone
   │  https://curatix-live.vercel.app         (Next.js 15, Vercel)
   ▼
Frontend  ── calls ──►  https://curatix.onrender.com/api/v1   (Django 5 + DRF, Render)
                              │
                              ├─ Postgres ............ Neon (pooled DATABASE_URL + DIRECT_DATABASE_URL)
                              ├─ Redis cache ......... Upstash (rediss://)
                              ├─ File storage ........ Supabase Storage, bucket "Curatix" (S3 API)
                              ├─ Email ............... Brevo SMTP (port 2525)
                              ├─ Payments ............ Cashfree (SANDBOX — no real money yet) / Razorpay adapter present
                              ├─ SMS ................. disabled (SMS_PROVIDER=disabled)
                              └─ Background jobs ..... in-process queue (QUEUE_BACKEND=local)

GitHub Actions "free-scheduler" (every 5 min) ──► POST /internal/tasks/run on Render
   runs: booking.release_expired, payments.reconcile_pending, settlements.release_due,
         events.waitlist_notify, notifications.sweep_stuck, core.purge_ephemeral_tokens
```

| Piece | Where | Deploys how |
|---|---|---|
| Frontend | Vercel project `curatix-live` | Automatically on every push to `main` |
| Backend API | Render web service | Automatically on every push to `main` |
| Database | Neon | **Migrations are manual** — see §6. Never run on boot. |
| Scheduled jobs | `.github/workflows/free-scheduler.yml` | Runs on GitHub's schedule |
| Code | `github.com/curatixlive/Curatix-Live-Main`, branch `main` | git remote name **`curatix`** |

There is a second, older remote called `origin` (`Hemanthsure123/EVNT_N_EXPERIENCE-`).
It is NOT what production deploys from. Push to **`curatix`**.

Health checks: `GET https://curatix.onrender.com/health/` → 200, and the site
home page → 200.

---

## 3. Code layout

```
backend/            Django project
  config/           settings (base/dev/test/staging/prod), urls, di.py (composition root), worker
  core/             ports & adapters, errors, unit of work + outbox, throttling, preflight, scheduling
  apps/<module>/    one folder per business module, all the SAME shape (see CLAUDE.md)
frontend/           Next.js app
  app/              routes: (site) public, (checkout) funnel, (organizer) /dashboard, (admin) /admin, /studio
  components/       UI by area: booking, event, discovery, organizer, admin, ticketing, ui (design system)
  lib/              typed API clients (lib/api), domain logic (pure, tested), utils
  tests/e2e/        Playwright specs (run against scripts/mock-api.mjs fixture)
deploy/             deploy scripts + *.local env files (git-ignored, hold production secrets)
.github/workflows/  ci, frontend, frontend-e2e, release, security, free-scheduler, operator
```

Layering rule (non-negotiable): **API view → service → repository → model**.
Views are thin, services hold rules, only repositories touch the ORM, every
third-party service sits behind a port in `core/ports` with a fake adapter for
tests. Full detail and the reason for every rule: `CLAUDE.md`.

---

## 4. Backend modules (`backend/apps/`)

| Module | What it owns |
|---|---|
| accounts | Users, sign-in (email + Google, built but needs Google credentials), email verification, profile incl. city |
| organizations | Organisations, verification by an operator, payout account, followers |
| events | Events, content (media, FAQs, running order), crew/lineup, co-hosts (per event), **team** (whole-organisation access), invites + access codes, waiting list, saved events, engagement counting |
| ticketing | Ticket tiers, row-locked reserve/release/confirm, sale phases, group bands, gender prices, pre-sale, price history |
| seating | Venue layouts, sections, per-event seats, seat holds |
| booking | Bookings, line items, signed QR tickets, idempotency, **buyer fee schedules (`FeePolicy`)**, access checks |
| payments | Gateway orders, signed webhooks, reconciliation, refunds, gateway switch |
| checkin | Door scanning under a per-ticket lock, attendance, scan log |
| coupons | Organiser-funded discount codes, scoped to ticket types |
| notifications | Every email/SMS/push, templates, exactly-once delivery ledger |
| settlements | Organiser payout after the event + refund window |
| organizer | Organiser dashboard reads: analytics, attendees, follow-ups, **campaigns** |
| console | Platform admin reads + actions |
| cms, announcements | Homepage content, promos, highlights |
| performers | Hire-a-Band marketplace |
| reviews, support, maps, integrations, agents | Reviews, support desk, Google Maps proxy, Google Calendar, outside-AI-assistant access |

---

## 5. Features shipped in the latest sessions

Everything below is live on production.

**Buyer side**
- Assigned seating with a seat picker (titled, colour-coded sections), seat on the ticket and at the door.
- Gender pricing (Male / Female / Standard, self-declared), shown on the picker, ticket, door scan and attendee list.
- Pre-sale and invite-only events with access codes; followers and past attendees get pre-sale automatically.
- Waiting list for sold-out events: asks for **ticket count + mobile number**; organiser is emailed; people are emailed automatically when tickets come back.
- **Buyer fee**: per ticket, `2% gateway + max(2%, ₹10)`, added on top — the organiser receives the full ticket price. Example: ₹500 ticket → buyer pays ₹520.
- Event page (mobile): About / Photos / Venue / Help tabs jump to their section; full About text shown; offers swipe with dots.

**Organiser side** (`/dashboard`)
- Single-page Create/Edit event with Save draft / Preview / Create at the end of the form; one-day and multi-day scheduling.
- Co-hosts **per event** (choose analytics / attendees / scanning / finance per person), and a **Team** page for people who help on **every** event of the organisation. A person's rights are the union of both.
- Event follow-ups page: **waiting list** (name, email, mobile, tickets wanted) and **unpaid checkouts** with one-tap **email reminders** (once per person per day).
- **Campaigns** page: customer counts (everyone / regulars / recent), top customers by spend, which venues draw the biggest crowds, and promotion emails to past buyers (capped at 500 per send). WhatsApp shown as "coming soon".
- Analytics per event, attendee list + CSV, door scanner with tier / seat / gender display rules.

**Admin side** (`/admin`)
- **Buyer fees** (Payments page): change the platform default, or set a fee for one event or one organiser; changes apply to new bookings only; capped at 20% / ₹500.
- Moderation, verifications, payments, refunds, settlements, users, health, audit, homepage CMS, AI-assistant access.

---

## 6. How to deploy a change (the order matters)

1. Run the checks (§8). Everything must pass.
2. Commit.
3. **If the change adds a migration, run it on production FIRST:**
   ```
   cd backend
   # load deploy/render.env.local into the environment, then:
   .venv/bin/python manage.py migrate_safe --yes
   ```
   The production settings refuse to start if `GOOGLE_OAUTH_REDIRECT_URI` points at
   localhost; for a one-off migration run set it to
   `https://curatix.onrender.com/api/v1/auth/oauth/google/callback` in the shell.
4. `git push curatix main` — Vercel and Render deploy themselves.
5. Check `/health/` and the site, and the Vercel status on the commit.

Pushing code that expects a column before the migration has run breaks
production; that is why migrations go first.

---

## 7. Accounts, secrets and where they live

**No secret is in git.** They are in these git-ignored files on the laptop, and
in each provider's dashboard:

| File | What it holds |
|---|---|
| `.env` (repo root) | Local development values |
| `deploy/render.env.local` | Every backend production variable (copy of what Render has) |
| `deploy/vercel.env.local` | Frontend production variables |
| `deploy/free-tier.env.edited.local`, `deploy/seeded-demo-ids.local` | Older deploy notes / seeded ids |
| `.localdb/` | Local Postgres data, test scripts, the local QA organiser login, the GitHub CLI |

**Back these files up somewhere safe (a password manager), never to GitHub.**
If the laptop is lost, they are the only copy outside the provider dashboards.

Provider accounts you own (each has its own login, independent of Claude):

| Service | Used for |
|---|---|
| GitHub `curatixlive` | Code, Actions (CI + scheduler) |
| Vercel | Frontend hosting |
| Render | Backend hosting |
| Neon | Production Postgres |
| Upstash | Redis cache |
| Supabase | File storage bucket `Curatix` |
| Brevo | Transactional email |
| Cashfree / Razorpay | Payments (Cashfree in sandbox) |
| Google Cloud | Maps key; OAuth client for Google sign-in + Calendar (sign-in still needs client id/secret set on Render) |

---

## 8. Checks (run before every push)

```
cd backend
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/mypy apps core config
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python -m pytest -q          # 5 Redis-adapter tests fail on a laptop with no local Redis; that is expected

cd ../frontend
npx tsc --noEmit && npx eslint . && npx vitest run
CI=1 npx playwright test               # builds production and starts the mock API on :8000 — stop local servers first
```

Local Postgres runs from `.localdb/data` via the bundled `pgserver` binaries:
```
backend/.venv/lib/python3.12/site-packages/pgserver/pginstall/bin/pg_ctl \
  -D .localdb/data -l .localdb/pg.log -o "-p 5432 -c listen_addresses=127.0.0.1" start
```

---

## 9. Claude / AI connectors

These are **per-machine or per-account settings**, not part of the code. After
switching Claude accounts, expect to approve each again.

| Connector | Where it is configured | Used for | After switching accounts |
|---|---|---|---|
| Neon MCP | global, `~/.claude.json` | Database inspection | Re-authorise (OAuth) |
| Upstash MCP | global, `~/.claude.json` | Redis inspection | Re-authorise |
| Supabase MCP | project, `.mcp.json` | Storage / SQL inspection | Re-authorise |
| GitHub CLI | `.localdb/gh-cli/...` signed in as `curatixlive` | Reading CI logs | Stays signed in (machine-level) |
| Claude in Chrome | Chrome extension | Testing in your real browser | Sign in to the extension with the new account |
| Built-in browser | Claude desktop app | Testing | Allow `curatix-live.vercel.app` in its site permissions |
| Curatix agent MCP | `POST /api/v1/mcp`, token granted in `/admin/assistant` | Let Claude/ChatGPT draft events | Grant a token to the new person in the admin console |

Claude Code's memory folder for this project is
`~/.claude/projects/-Users-karthikchowdary-Desktop-EVNT-N-EXPERIENCE-/memory/`
(currently empty). The project's real memory is `CLAUDE.md` in the repo, which
any account reads automatically.

---

## 10. Known gaps and open items

- **Payments are in sandbox.** No real money moves until the Cashfree production
  key is set and `CASHFREE_ENVIRONMENT` is switched together with it.
- **Google sign-in** is built but off: create an OAuth client in Google Cloud,
  add redirect URI `https://curatix.onrender.com/api/v1/auth/oauth/google/signin/callback`,
  set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `GOOGLE_OAUTH_SIGNIN_REDIRECT_URI` on Render.
- **WhatsApp** is built and OFF (`WHATSAPP_PROVIDER=disabled`): every message
  type has a WhatsApp companion and campaigns can choose WhatsApp. Turning it
  on is configuration only — follow `WHATSAPP_SETUP.md` (Meta Business account,
  two Render values, submit the listed templates).
- **SMS** is disabled.
- **AWS release stages are removed** (publish, scan-image, deploy, rollback —
  they failed on every push because no AWS deploy role exists, and e-mailed a
  "deploy failed" notice each time). `release.yml` is now only the gate (CI,
  frontend, security). The old workflow is kept unexecuted at
  `.github/disabled/release-aws.yml.txt`; to bring AWS back, restore the stages,
  set the repo variable `AWS_DEPLOY_ROLE_ARN` and re-add `id-token: write`. The
  AWS invariants in `core/tests/test_deployment_topology.py` are asserted against
  that copy.
- **Checkout price estimate** on the ticket picker uses the default fee; an event
  with an admin fee override shows the real fee from the review screen onwards.
- **Organiser fee override** in the admin page takes a pasted organisation id
  (events have a search picker).
- **Built since the 25 Oct handoff** (see CLAUDE.md "The four handoff items"):
  multi-day orders (one booking across several sessions), co-host `bookings` and
  `edit` rights, per-seat gender in seated orders (**needs migration
  `seating.0002_eventseat_held_gender` on production BEFORE the push**), and a
  Past campaigns list. A first alignment pass also landed (bottom tab bars,
  event page width on tablet, rail gutters, funnel action bar, truncated copy).
- **Still not built**: a whole-site visual QA on a real device matrix, and the
  items in `PENDING_TASKS.md` / `frontend/BACKLOG.md`.
- **Session of 30–31 Oct 2026 (what changed, and what is still held back)**
  - **Live:** self-hosted fonts (`next/font/local`, so a Google outage cannot fail the
    build); venue search that works with no Google key (OpenStreetMap fallback,
    `MAPS_FALLBACK=osm`) and no longer sends an invalid Places type; promo codes can
    be queued before an event is saved (created automatically on first save);
    tags are optional (minimum removed, backend and frontend); the lifecycle
    notification sweep and WhatsApp ticket QR; the organiser and attendee portals are
    separate (the organiser bar is Overview / My events / + / Scan / Menu, and
    `/dashboard/home` just redirects to `/dashboard`); the save control is a
    bookmark; co-hosted events are poster cards, and a NEW co-host gets everything
    except finance by default; the location prompt no longer opens mid-hydration
    (it caused an intermittent React #418 on about 1 in 5 first visits).
  - **NOT live — held back on purpose:** the wallet / GST billing / admin-mediated
    Hire a Band commit (local branch `main`, one commit on top of `curatix/main`).
    Before it can ship, the owner must set on Render
    `VENDOR_PAYOUT_BACKEND=cashfree` (the new code refuses to boot on the fake
    backend) and choose `PAYOUTS_MODE` (`wallet` turns OFF the automatic organiser
    payout release; `settlements` keeps it). Then run `migrate_safe` on production
    FIRST (wallet 0001, billing 0001, booking 0013 — a NOT NULL column, so do it
    immediately before the push — performers 0006, notifications 0019/0020), then push.
  - **Deploy recipe used:** make fixes in a clean worktree of `curatix/main`, test
    it (backend suite, ruff, mypy, `makemigrations --check`, frontend `tsc`, eslint,
    vitest AND `next build`), push, then rebase the local branch onto it.
  - **Testing notes:** the local stack does not survive a laptop restart (start
    Postgres, the backend and `npm run dev` again); a full `next build` overwrites
    the `.next` folder a running `next dev` is using, so restart dev after one.
- **Known, low severity, NOT fixed — intermittent React #418 on the live home page.**
  About one first visit in five logs a minified hydration error in the browser
  console on https://curatix-live.vercel.app/ (React recovers by re-rendering; the
  page works). It does NOT reproduce locally in dev, nor in a local production
  build against the live API (0 of 30 loads), so it depends on how Vercel serves
  the cached page. Ruled out: campaign schedule windows (none set), the
  location prompt (made post-load-only, still happens), the carousel (starts at
  slide 0). Next step if it matters: capture the failing document with a Vercel
  preview deployment and `NEXT_PUBLIC_*` source maps, or bisect by removing home
  sections one at a time on a preview URL.
- Full list: `PENDING_TASKS.md` and `frontend/BACKLOG.md`.

---

## 11. Starter prompt for a new Claude session

Paste this as the first message in a new Claude Code session opened on this
folder, then add the task you want done:

```
You are taking over Curatix, a live Indian event-ticketing platform (Django
backend on Render, Next.js frontend on Vercel, Postgres on Neon). Before doing
anything, read HANDOFF.md, then CLAUDE.md, in the repo root, and follow
CLAUDE.md's rules exactly — they are binding.

Ground rules:
- Production deploys automatically from `git push curatix main` (remote
  `curatix`, NOT `origin`). Never push until all checks in HANDOFF.md §8 pass.
- If a change adds a migration, run it on production with `migrate_safe` BEFORE
  pushing (HANDOFF.md §6), and tell me first.
- Never print, commit or send any secret. They live in git-ignored files listed
  in HANDOFF.md §7.
- Money paths (ticketing, booking, payments, settlements, fees) decide under row
  locks, never from a cache; ask me before changing what a customer is charged.
- Test what you build (backend pytest, frontend tsc/eslint/vitest, Playwright),
  check it in a browser where it is visible, and tell me plainly what you
  verified and what you did not.
- When done, update HANDOFF.md §0 and §10 so the next session starts current.

My task:
```

Open items a new session can pick up straight away are listed in §10.
