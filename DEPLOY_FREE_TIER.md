# Free-tier test deployment (Neon + Upstash + Supabase Storage + Brevo + Render + Vercel)

For TESTING only. Everything below is free. Use sandbox/test payment keys: no real money moves.
Never paste a secret into a chat, an issue or a commit; put it only in the host's secret store.

**Do the services in this order** (later ones need earlier values). Keep a private notes file
for the values, you will paste each into Render once.

| # | Service | You get |
|---|---|---|
| 1 | Neon (done) | `DATABASE_URL` (pooled, host has `-pooler`) and `DIRECT_DATABASE_URL` |
| 2 | Upstash | `REDIS_URL` |
| 3 | Supabase Storage | `S3_*` values |
| 4 | Brevo | `SMTP_*` values |
| 5 | Cashfree + Razorpay | your sandbox / test keys |
| 6 | Render | the API URL |
| 7 | Vercel | the website URL |
| 8 | GitHub secrets | scheduler switched on |
| 9 | Webhooks | payments confirmed automatically |

## 2. Upstash (Redis)
1. upstash.com -> sign up -> **Create Database** -> type **Redis**, name `curatix`.
2. Region: **US East (N. Virginia)** (closest to Neon's Ohio and Render Ohio). Plan: **Free**. Enable TLS.
3. Open the database -> **Details** -> copy the URL that starts **`rediss://`** into `REDIS_URL`.

## 3. Supabase Storage (poster images)
1. supabase.com -> New project (any name; save the DB password, you will not need it).
2. **Storage** -> New bucket `curatix-media` -> switch **Public bucket** ON.
3. Project Settings -> **Storage** -> **S3 Connection**: copy the **Endpoint** into `S3_ENDPOINT_URL`;
   create a **New access key** and copy the key id / secret into `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`.
4. `S3_BUCKET_NAME=curatix-media`. `S3_REGION` = the region shown there (the template has `ap-south-1`; change it).
5. `S3_PUBLIC_BASE_URL=https://<project-ref>.supabase.co/storage/v1/object/public/curatix-media`
   Use the same host as `NEXT_PUBLIC_MEDIA_BASE_URL` in Vercel, or posters will not display.

## 4. Brevo (email)
1. brevo.com -> sign up (free: 300 emails/day).
2. **Senders** -> add and verify the email you will send from -> that is `SMTP_FROM_EMAIL`.
3. **SMTP & API** -> **SMTP** tab: host `smtp-relay.brevo.com`, port `587`, copy **Login** into `SMTP_USERNAME`
   and create an **SMTP key** into `SMTP_PASSWORD`.
Free sender addresses may land in spam; for testing, check the spam folder.

## 5. Payment keys
Cashfree: merchant dashboard -> Developers -> API Keys -> **Test/Sandbox** pair -> `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`.
Razorpay: Dashboard in **Test mode** -> Account & Settings -> API Keys -> `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`;
invent a long random `RAZORPAY_WEBHOOK_SECRET` (you will paste the same value into Razorpay in step 9).
(Razorpay payouts to organizers need Route activated, so test checkout and tickets first.)

## 6. Render (the API), free Web Service
1. render.com -> **New +** -> **Web Service** -> connect GitHub -> `curatixlive/Curatix-Live-Main`.
2. Name **`curatix-api`**, Language **Docker**, **Root Directory `backend`**, Region **Ohio**, Instance **Free**.
3. **Health Check Path** `/health/`.
4. **Environment** -> **Add from .env** -> paste `deploy/free-tier.env.template` with every blank filled.
   Generate the four secrets with `openssl rand -base64 48` (run it four times).
   `ALLOWED_HOSTS=curatix-api.onrender.com` (use the exact host Render shows if the name was taken).
   Leave the Vercel URLs for step 7.
5. **Create Web Service.** First boot can take ~5 minutes. If it fails, the log names the missing variable; fix and redeploy.
6. The database schema is already applied to Neon. For a fresh database run migrations first from your machine.
Free instances sleep after 15 minutes idle (first request then takes 30-60 s). Step 8 keeps it awake.

## 7. Vercel (the website)
1. vercel.com -> **Add New -> Project** -> import the repo -> **Root Directory `frontend`**.
2. Environment variables (Production and Preview):
   `NEXT_PUBLIC_API_BASE_URL=https://curatix-api.onrender.com`,
   `NEXT_PUBLIC_SITE_URL=https://<your-project>.vercel.app` (use the name Vercel gives; edit after first deploy),
   `NEXT_PUBLIC_MEDIA_BASE_URL=https://<project-ref>.supabase.co`, `NEXT_PUBLIC_CASHFREE_ENVIRONMENT=sandbox`,
   `NEXT_PUBLIC_RAZORPAY_KEY_ID=<your rzp_test key id>`.
3. Deploy. Then in **Render -> Environment** set `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `FRONTEND_BASE_URL`,
   `PUBLIC_SITE_URL` to the Vercel URL (no trailing slash) and let Render redeploy.
4. Redeploy Vercel once (`NEXT_PUBLIC_*` values are baked in at build time).

## 8. Scheduler (GitHub Actions, free)
Repo -> Settings -> Secrets and variables -> Actions -> New repository secret:
`RENDER_API_URL=https://curatix-api.onrender.com` and `INTERNAL_TASK_SECRET=<same value as on Render>`.
Then Actions -> **free-scheduler** -> Run workflow once; every line should say `-> 200`.
It then runs every 5 minutes: releases expired holds, reconciles payments, releases approved payouts,
notifies waiting lists. (GitHub may delay scheduled runs a few minutes; that is fine for testing.)

## 9. Webhooks (so payments confirm themselves)
- Cashfree: Developers -> Webhooks -> `https://curatix-api.onrender.com/api/v1/payments/webhook/cashfree`
- Razorpay: Settings -> Webhooks -> `https://curatix-api.onrender.com/api/v1/payments/webhook`, event `payment.captured`,
  secret = your `RAZORPAY_WEBHOOK_SECRET`.
The app also confirms payments by asking the gateway directly (the scheduler does this), so a missed webhook is not fatal.

## First admin user
From a machine with the repo, `DATABASE_URL`/`DIRECT_DATABASE_URL` for Neon exported:
`cd backend && python manage.py ensure_admin --email you@example.com --password '<choose>' --name You`
(run locally against Neon, or ask Claude to do it with the env on this machine).

## What to test
Browse -> book -> pay with a sandbox test card -> ticket email -> My tickets -> organizer scan (check-in) ->
Admin -> Payments -> switch gateway -> Admin -> Settlements.

## Limits of the free setup
Cold starts; one web process (no separate worker or scheduler); Neon/Upstash/Supabase/Brevo free quotas;
Vercel Hobby is for non-commercial use (use Netlify/Cloudflare Pages free tiers or a paid plan for a real launch).
