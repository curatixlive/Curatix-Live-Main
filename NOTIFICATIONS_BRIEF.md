# Brief: messaging, WhatsApp, Hire a Band, and moderation changes

Owner's instructions, 30 Oct 2026. Read CLAUDE.md first; follow its layering,
money-path and deploy rules (migrate production BEFORE pushing, tell the owner
first). WhatsApp uses Meta Cloud API, `WHATSAPP_PROVIDER=disabled` until the
owner adds the key — every WhatsApp message must be skipped cleanly while off,
and email always still goes. Only message people who opted in
(`User.whatsapp_opt_in`) with a phone number.

## 1. One branded email design for EVERY email

Replace plain-text-looking emails with one consistent, eye-catching, standard
layout (Curatix wordmark header, violet accent, clear title, short body, one
primary button, a details/facts block, footer with why they got it and support
contact). Reuse/extend `apps/notifications/email_layout.py` (the verification
email already uses a branded design — make every template match it). Must
render well in Gmail, Outlook and Apple Mail, light and dark mode, and on
phones. Every email keeps a plain-text alternative. Update the email layout
tests.

## 2. WhatsApp for tickets and feedback

- **Tickets on WhatsApp:** after payment, send the ticket itself on WhatsApp
  with all details: event, date and time, venue with maps link, ticket type,
  seat (if seated), quantity, booking reference, and the QR code as an IMAGE
  (or document) header so it can be scanned straight from WhatsApp. One
  message per ticket if the order has several attendees.
- **Feedback after the event:** WhatsApp review request after the event ends
  (once per attendee, same rules as the review email).
- **Any change to an event** (venue, date, time, cancellation): notify every
  ticket holder by email AND WhatsApp. This needs a new "event changed" domain
  event emitted when an organiser edits those fields on a live event.

## 3. New emails + WhatsApp (each gets both)

Customers:
1. Ticket hold about to expire (once, mid-hold, reserved-but-unpaid).
2. Event-day morning message (time, gates, maps link, QR link).
3. Event changed (see above).
4. Booking expired/cancelled, nothing charged.
5. Pre-sale opening, to followers of the organiser.
6. New event published by an organiser you follow.

Organisers:
7. Organisation verification APPROVED or REJECTED (with reason).
8. Sold-progress alerts at **80%, 90% and 100%** of tickets sold (each once
   per event).
9. **Offer filled/closed:** when an early-bird phase, group offer or any
   limited offer slot is used up or its window closes (e.g. early bird 50,
   another offer 50, another 100 — tell the organiser as each fills).
10. Payout failed.
11. Added as a co-host or to a team.
12. Daily sales summary (yesterday's tickets and revenue), opt-out-able.

Admin:
13. Needs-attention alerts (new organiser to verify, failed payout, new Hire a
    Band request).

## 4. Hire a Band becomes admin-mediated

A customer's band request goes to the ADMIN team, not to performers directly.
Admins contact the customer, suggest bands, or — if the customer named a band —
act as the mediator between band and customer. Build:
- Request form: customer name, phone, email, event date, city, budget,
  description, optional "band I have in mind".
- Admin console queue: status (new, contacted, bands suggested, booked,
  closed), notes, assigned admin, suggested bands (from the performer list or
  free text), contact log.
- Emails + WhatsApp: customer gets "we received your request" and status
  updates; admin team gets "new request".
- Performers no longer see customer briefs directly (check what the current
  marketplace exposes and remove direct quoting from the customer flow).

## 5. Paid WhatsApp campaigns for organisers

- Organisers can send campaign promotions on WhatsApp, but it is PAID.
- Price per message is set by the admin from the admin console. **Default ₹1
  per message.** Admin can change it any time.
- When the admin lowers the price below the default, show it as a discount:
  e.g. "~~₹1~~ ₹0.50 per message — 50% off". Store the regular price and the
  current price; compute the percentage.
- Before sending, show the organiser: recipients who opted in, price per
  message, total cost. Decide with the owner how payment is collected (charge
  before sending via the payment gateway, or deduct from settlement) — ASK the
  owner before building the charging step.
- Record every campaign's message count and cost.

## 6. Remove admin approval for events

- An organiser whose ORGANISATION is verified can publish any number of events
  instantly: no event moderation, no pending-review state for new events.
- Admins can still DELETE (or take down) any event from the admin console,
  with a reason, and the organiser is notified.
- Remove the event moderation queue from the admin UI and the "submitted for
  review" flow; keep organisation verification as the one gate.
- Update CLAUDE.md where it describes event moderation.

## Done means

Backend tests, frontend tests, e2e, ruff/mypy/tsc/eslint all pass; every email
checked visually; production migrations run first; pushed; live smoke test;
`WHATSAPP_SETUP.md` lists every WhatsApp template's exact wording and category
for Meta approval; HANDOFF.md updated.

## 7. Organiser wallet and payouts (BUILD THIS FIRST)

Owner's decisions, 30 Oct 2026:

- **Curatix never holds organisers' money.** Use **Cashfree Easy Split
  (vendors)**: each organiser is a Cashfree vendor; Cashfree holds their
  balance and pays it straight to their bank. Curatix only records and
  requests.
- **KYC first.** No wallet until the organiser completes KYC (PAN, bank account
  + IFSC, name, business type, GSTIN optional) — submitted to Cashfree's vendor
  onboarding API; status shown in the dashboard (pending / verified /
  rejected with reason). Never store full bank/PAN details beyond what the
  UI must show (mask them).
- **Wallet** in the organiser dashboard: pending (sold, event not ended),
  withdrawable, paid out, and a ledger of every movement (sale, refund,
  WhatsApp campaign cost, payout, payout fee). Ticket revenue = the organiser's
  share (ticket price; buyer fees and donations are not theirs).
- **Withdrawable as soon as the event ends.** A refund after that reduces the
  balance; the balance may go negative — handle and show it.
- **Payout request:** organiser asks Curatix → Curatix validates under a row
  lock (no double withdrawal, amount ≤ withdrawable) → calls Cashfree to pay
  the vendor → Cashfree sends money to the organiser's bank. Idempotency key
  on every Cashfree call; status updates from Cashfree webhook/polling;
  failed payouts return to the wallet.
- **Two payout types:**
  - **General:** free, next working day.
  - **Instant:** fee = admin-set % (default **0.5%**) **+ 18% GST on the fee**,
    shown before confirming and on the receipt. Admin can change the %, make it
    free, or switch instant payouts off.
- **WhatsApp campaign cost is deducted from the wallet** (see section 5);
  refuse the campaign if the balance is short.
- Replaces the Razorpay Route payout path in `settlements` — payments are on
  Cashfree, and the Cashfree adapter's `split_transfer`/`release_payout`
  currently raise NotImplementedError, so organisers cannot be paid today.
  Concurrency test required (N racing payout requests withdraw exactly once).
- Admin console: all wallets, payout requests, fee settings, failed payouts.

## 8. Owner decisions, 31 Oct (before going offline for ~10h)

- Hire a Band: REMOVE direct quoting. Requests go only to the admin team; band
  profiles stay browsable/nameable; admins suggest bands and close deals.
- Organiser GST "added on top": the Curatix buyer fee is computed on
  ticket + GST.
- Customer GST bills are issued in the ORGANISER's name (their GSTIN, legal
  name, address); the Curatix fee is a separate line.
- WhatsApp campaign price: admin sets a REGULAR price (default ₹1) and a
  CURRENT price; if current < regular, organisers see ~~₹1~~ ₹0.50, 50% off.
- Paid WhatsApp campaigns: cost is deducted from the organiser's wallet;
  sending is blocked when the cost exceeds what they are owed.
- Organiser Billing section: "I have GST" tick; registered GST details first
  (GSTIN, legal name, address, state); "generate and send bills to customers?";
  "GST included in ticket price?" — if not, "add GST on top?" and the %.
