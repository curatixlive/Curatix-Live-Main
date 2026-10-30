# WhatsApp setup (Meta WhatsApp Cloud API)

WhatsApp is **built and switched off**. Every WhatsApp message is skipped
cleanly (the email still goes) until the steps below are done. Turning it on is
configuration only: no code change and no deploy of new code.

## What it sends

Each message goes **beside** its email, never instead of it, and only to a
person who:

1. has a phone number on their account, and
2. turned on **"Get tickets and updates on WhatsApp"** in their profile
   (Account → Settings → Profile). WhatsApp's business policy requires that
   opt-in; an email address on file is not one.

Organisers can also choose **WhatsApp** on a campaign (Dashboard → Campaigns);
it reaches only the customers who opted in, and the composer shows how many.

The code: `backend/apps/notifications/whatsapp.py` (templates, slot values,
which email each one accompanies), `backend/core/adapters/meta_whatsapp/`
(the API call), `backend/core/ports/whatsapp_port.py`.

## Steps for you

1. **Meta Business account.** At business.facebook.com, create (or use) the
   Curatix business and complete business verification.
2. **WhatsApp app.** At developers.facebook.com → My Apps → Create app →
   Business → add the **WhatsApp** product. Add your business phone number
   (it must not already be on the WhatsApp app; it gets a display name review).
3. **Two values for Render** (WhatsApp → API Setup, and Business Settings →
   System Users):
   - `WHATSAPP_PHONE_NUMBER_ID`: the **Phone number ID** shown under API Setup
     (not the phone number itself).
   - `WHATSAPP_ACCESS_TOKEN`: create a **System User**, give it the WhatsApp
     account with full control, and generate a **permanent token** with
     `whatsapp_business_messaging` and `whatsapp_business_management`.
     The 24-hour token on the API Setup page expires and will stop delivery.
4. **Templates.** In WhatsApp Manager → Message templates, create each template
   below with the **exact name, category, language English (`en`) and body**.
   Approval usually takes minutes to a day. A template that is not approved
   fails its sends with Meta's reason recorded on the notification log; email
   is unaffected.
5. **Switch it on in Render** (Environment):
   ```
   WHATSAPP_PROVIDER=meta
   WHATSAPP_PHONE_NUMBER_ID=<from step 3>
   WHATSAPP_ACCESS_TOKEN=<from step 3>
   ```
   Optional: `WHATSAPP_TEMPLATE_LANGUAGE` (default `en`), `WHATSAPP_API_VERSION`
   (default `v21.0`), and `WHATSAPP_TEMPLATE_NAMES` (`type=name,...`) if Meta
   made you rename a template. Production refuses to start with `meta` but
   either value missing, so a typo is caught at deploy rather than at the first
   ticket.
6. **Test**: turn on WhatsApp in your own profile with your number, book a
   ticket to a test event, and you should get the booking message.

Keep the access token in Render only. Never paste it into a chat or commit it.

## Costs

Meta charges per conversation, by category (Utility, Marketing,
Authentication), billed to the WhatsApp Business account's payment method.
Marketing (campaigns) costs the most. Utility messages sent within 24 hours of
the customer writing to you are free. Charging organisers for their WhatsApp
campaigns is not built yet.

## The templates to create

### 1. `curatix_booking_confirmed` (UTILITY)

- **Sent when:** booking confirmed, beside the "Ticket delivery email".
- **Body:**

  ```
  Hi {{1}}, your booking for {{2}} on {{3}} is confirmed. Booking reference: {{4}}. Your QR tickets are in your email and at {{5}} - see you there!
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Sunburn Jazz Night; `{{3}}` = Sat 23 Aug 2026, 8:10 pm; `{{4}}` = 3F1D9C22; `{{5}}` = https://curatix-live.vercel.app/account/tickets

### 2. `curatix_refund_processed` (UTILITY)

- **Sent when:** refund processed, beside the "Refund confirmation email".
- **Body:**

  ```
  Hi {{1}}, a refund of {{2}} for {{3}} has been processed. It usually reaches your account in 5 to 7 working days.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Rs 1,040; `{{3}}` = Sunburn Jazz Night

### 3. `curatix_event_reminder` (UTILITY)

- **Sent when:** event reminder, beside the "Event reminder email".
- **Body:**

  ```
  Hi {{1}}, a reminder that {{2}} is on {{3}} at {{4}}. Keep your QR ticket ready at the door: {{5}} - enjoy the show!
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Sunburn Jazz Night; `{{3}}` = Sat 23 Aug 2026, 8:10 pm; `{{4}}` = Phoenix Arena, Mumbai; `{{5}}` = https://curatix-live.vercel.app/account/tickets

### 4. `curatix_waitlist_available` (UTILITY)

- **Sent when:** waitlist tickets available, beside the "Waitlist: tickets available".
- **Body:**

  ```
  Hi {{1}}, tickets are available again for {{2}} on {{3}}. They are first come, first served and nothing is held for you. Book here: {{4}} before they go.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Sunburn Jazz Night; `{{3}}` = Sat 23 Aug 2026, 8:10 pm; `{{4}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 5. `curatix_finish_booking` (UTILITY)

- **Sent when:** finish your booking, beside the "Payment reminder".
- **Body:**

  ```
  Hi {{1}}, your payment for {{2}} did not go through, so no ticket was issued and nothing was charged. {{3}} would still love to see you. Book again: {{4}} if you would still like to come.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Sunburn Jazz Night; `{{3}}` = Groove Collective; `{{4}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 6. `curatix_event_cancelled` (UTILITY)

- **Sent when:** event cancelled, beside the "Event cancelled (attendee)".
- **Body:**

  ```
  Hi {{1}}, we are sorry: {{2}} has been cancelled by the organiser. Your booking {{3}} will be refunded in full. Details are in your email.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Sunburn Jazz Night; `{{3}}` = 3F1D9C22

### 7. `curatix_review_request` (UTILITY)

- **Sent when:** review request, beside the "Post-event review request".
- **Body:**

  ```
  Hi {{1}}, thanks for coming to {{2}}. How was it? Leave a quick rating: {{3}} - it takes ten seconds.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Sunburn Jazz Night; `{{3}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 8. `curatix_event_invite` (UTILITY)

- **Sent when:** event invitation, beside the "Event invitation".
- **Body:**

  ```
  You are invited! {{1}} invited you to {{2}} on {{3}}. Use access code {{4}} at checkout: {{5}} - see you there.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Groove Collective; `{{2}}` = Sunburn Jazz Night; `{{3}}` = Sat 23 Aug 2026, 8:10 pm; `{{4}}` = 482913; `{{5}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 9. `curatix_password_reset` (AUTHENTICATION)

- **Sent when:** password reset code, beside the "Password reset code (email)".
- **Create it as:** Authentication template, "Copy code" button, code length 6. Meta writes the wording; it reads roughly:

  ```
  {{1}} is your verification code. For your security, do not share this code.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = 482913

### 10. `curatix_waitlist_joined` (UTILITY)

- **Sent when:** waitlist entry (organiser), beside the "Waitlist: new entry (organiser)".
- **Body:**

  ```
  New waiting-list request for {{1}}: {{2}} wants {{3}} ticket(s). Mobile: {{4}}. See the list: {{5}} to follow up.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Sunburn Jazz Night; `{{2}}` = Ravi; `{{3}}` = 2; `{{4}}` = +91 98765 43210; `{{5}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 11. `curatix_organiser_update` (MARKETING)

- **Sent when:** organiser campaign, when an organiser chooses WhatsApp on a campaign.
- **Body:**

  ```
  Hi {{1}}, an update from {{2}}: {{3}} See what is on: {{4}} - to stop these messages, turn off WhatsApp updates in your Curatix profile.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Groove Collective; `{{3}}` = Winter series. Early access opens Friday.; `{{4}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night


### 12. `curatix_ticket` (UTILITY)

- **Header:** add an IMAGE header (sample: any QR picture). Each ticket's own QR code is sent here; Meta fetches it from `PUBLIC_API_URL/tickets/qr/<token>.png`, so set `PUBLIC_API_URL` (e.g. `https://curatix.onrender.com/api/v1`) on Render first. Without it a single booking confirmation is sent instead of one message per ticket.
- **Sent when:** ticket, on its own trigger.
- **Body:**

  ```
  Hi {{1}}, here is your ticket for {{2}}. When: {{3}}. Where: {{4}}. Ticket: {{5}}. Booking reference: {{6}}. Directions: {{7}} - show this QR code at the gate.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Sunburn Jazz Night; `{{3}}` = Sat 23 Aug 2026, 8:10 pm; `{{4}}` = Phoenix Arena, Mumbai; `{{5}}` = General entry; `{{6}}` = 3F1D9C22; `{{7}}` = https://maps.google.com/?q=Phoenix+Arena

### 13. `curatix_hold_expiring` (UTILITY)

- **Sent when:** hold expiring, beside the hold expiring email.
- **Body:**

  ```
  Hi {{1}}, your tickets for {{2}} are on hold for {{3}} more minutes and nothing has been charged. Finish booking here: {{4}} before they go back on sale.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Sunburn Jazz Night; `{{3}}` = 4; `{{4}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 14. `curatix_event_day` (UTILITY)

- **Sent when:** event day, beside the event day email.
- **Body:**

  ```
  Hi {{1}}, {{2}} is today! Gates open {{3}} at {{4}}. Directions: {{5}} - keep your QR ticket ready ({{6}}) and see you there.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Sunburn Jazz Night; `{{3}}` = 7:00 pm; `{{4}}` = Phoenix Arena, Mumbai; `{{5}}` = https://maps.google.com/?q=Phoenix+Arena; `{{6}}` = https://curatix-live.vercel.app/account/tickets

### 15. `curatix_event_changed` (UTILITY)

- **Sent when:** event changed, beside the event changed email.
- **Body:**

  ```
  Hi {{1}}, an update for {{2}}: {{3}}. Your ticket is still valid. If you cannot go any more you can ask for a refund: {{4}} - sorry for the change.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Sunburn Jazz Night; `{{3}}` = venue: Hall B; `{{4}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 16. `curatix_booking_expired` (UTILITY)

- **Sent when:** booking expired, beside the booking expired email.
- **Body:**

  ```
  Hi {{1}}, your booking for {{2}} was not completed in time, so the tickets went back on sale. Nothing was charged. Book again: {{3}} if you still want to go.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Sunburn Jazz Night; `{{3}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 17. `curatix_presale_opening` (UTILITY)

- **Sent when:** presale opening, beside the presale opening email.
- **Body:**

  ```
  Hi {{1}}, because you follow {{2}}, pre-sale for {{3}} is open now, before general sale. Book early: {{4}} - tickets are limited.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Groove Collective; `{{3}}` = Sunburn Jazz Night; `{{4}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 18. `curatix_new_event` (MARKETING)

- **Sent when:** followed new event, beside the followed new event email.
- **Body:**

  ```
  Hi {{1}}, {{2}} just announced {{3}} on {{4}}. See it here: {{5}} - you get this because you follow them; turn off WhatsApp updates in your profile to stop.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Groove Collective; `{{3}}` = Sunburn Jazz Night; `{{4}}` = Sat 23 Aug 2026, 8:10 pm; `{{5}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 19. `curatix_org_verified` (UTILITY)

- **Sent when:** org verified, beside the org verified email.
- **Body:**

  ```
  Good news: {{1}} is verified on Curatix. You can publish events now and they go on sale straight away. Create one: {{2}} - welcome aboard!
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Groove Collective; `{{2}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 20. `curatix_org_declined` (UTILITY)

- **Sent when:** org rejected, beside the org rejected email.
- **Body:**

  ```
  We could not verify {{1}} yet. Reason: {{2}}. Update your details and apply again: {{3}} - reply to this message if you need help.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Groove Collective; `{{2}}` = PAN image was blurry; `{{3}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 21. `curatix_sales_milestone` (UTILITY)

- **Sent when:** sales milestone, beside the sales milestone email.
- **Body:**

  ```
  Good news: {{1}} has reached {{2}}% sold: {{3}} of {{4}} tickets. See your dashboard: {{5}} - keep it going!
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Sunburn Jazz Night; `{{2}}` = 90; `{{3}}` = 90; `{{4}}` = 100; `{{5}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 22. `curatix_offer_closed` (UTILITY)

- **Sent when:** offer closed, beside the offer closed email.
- **Body:**

  ```
  Offer update: {{1}} on {{2}} for {{3}} has ended: {{4}}. Tickets now sell at {{5}}. Dashboard: {{6}} - add another offer if you like.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Early bird; `{{2}}` = General; `{{3}}` = Sunburn Jazz Night; `{{4}}` = it sold out; `{{5}}` = Rs 1,200; `{{6}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 23. `curatix_payout_failed` (UTILITY)

- **Sent when:** payout failed, beside the payout failed organizer email.
- **Body:**

  ```
  Your payout for {{1}} did not go through: {{2}}. The money is still owed to you. Check your payout details: {{3}} - reply if you need help.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Sunburn Jazz Night; `{{2}}` = bank rejected the transfer; `{{3}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 24. `curatix_cohost_added` (UTILITY)

- **Sent when:** cohost added, beside the cohost added email.
- **Body:**

  ```
  Hi {{1}}, {{2}} added you to help run {{3}} on Curatix. Open your dashboard: {{4}} - you can already see what they shared with you.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = Groove Collective; `{{3}}` = Sunburn Jazz Night; `{{4}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

### 25. `curatix_daily_summary` (UTILITY)

- **Sent when:** daily sales summary, beside the daily sales summary email.
- **Body:**

  ```
  Hi {{1}}, yesterday you sold {{2}} tickets for {{3}}. Full breakdown: {{4}} - turn this off in Settings, Notifications.
  ```

- **Sample values (Meta asks for these):** `{{1}}` = Asha; `{{2}}` = 42; `{{3}}` = Rs 52,000; `{{4}}` = https://curatix-live.vercel.app/events/sunburn-jazz-night

## Not built yet

- **Delivery receipts and replies.** Meta's webhook (delivered/read, and a
  customer replying STOP) is not connected; opting out is done from the
  profile switch. Add it when the account is live.
- **Opt-in at checkout and on the waiting-list form.** Today the switch lives
  on the profile only.
- **Billing organisers for WhatsApp campaigns.**
