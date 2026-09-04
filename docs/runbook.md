# Operations runbook

Early draft — expands as later phases land.

## Deploying

1. Merge to `main` → CI runs (migrate + seed + typecheck + lint + test + build).
2. Staging deploy (Vercel) runs `prisma migrate deploy` automatically via the
   build command, against the staging Supabase database.
3. Promote to production after a smoke test of `/login` and `/api/health`.

Production build command: `npm run build` (includes `prisma generate`).
Set `prisma migrate deploy` as a Vercel "install"/"build" step or a release
hook so migrations apply before the new version serves traffic.

## First-time environment setup

1. Create a Supabase project (Mumbai region). Copy the pooled and direct
   connection strings.
2. Set env vars in Vercel: `DATABASE_URL` (pooled), `DIRECT_URL` (direct),
   `NEXT_PUBLIC_APP_URL`, `NODE_ENV`, session/lockout tuning if non-default.
   `NEXT_PUBLIC_APP_URL` **must** be the real public origin — customer tracking
   links (`/track/<token>`) are built from it. `STORAGE_MAX_DOCUMENT_BYTES`
   (default 10 MB) caps LR / tracking PDF uploads. Set `TRACKING_LINK_SECRET`
   (32+ chars) so tracking links survive a `DATABASE_URL` change.
3. Run `npx prisma migrate deploy`.
4. Run `npm run db:seed` **once**. Capture the printed temporary passwords and
   distribute them to each partner/staff member over a secure channel.
5. Confirm each account is forced to change password on first sign-in.
6. **Scheduled jobs.** Set `CRON_SECRET` (16+ chars) and schedule two GET calls
   with header `Authorization: Bearer <CRON_SECRET>`:
   - `/api/cron/release-holds` — every ~15 min (expired stock holds).
   - `/api/cron/notifications` — every ~2–5 min (WhatsApp delivery + retries).
   - `/api/cron/reconcile-cashfree` — every ~2–5 min (catches a Cashfree
     payment whose webhook was missed; a no-op for partners not using
     Cashfree). See "Cashfree automatic payment verification" below.
     All three are idempotent and safe to over-call. Until `CRON_SECRET` is
     set they return 503 and nothing is delivered.

## WhatsApp notifications

Order updates (payment received, packed, parcel booked, LR available, review
request) are queued in `notification_outbox` and delivered by the
`/api/cron/notifications` worker.

**Configure the real provider (Meta WhatsApp Business Cloud API):**

1. In Meta Business Manager, add a WhatsApp product, get a permanent
   **system-user access token**, the **phone number ID**, and register the five
   message templates: `payment_received`, `order_packed`, `parcel_booked`,
   `lr_available`, `review_request` (body params in the order documented in
   `src/lib/notifications/templates.ts`), each in English **and** Tamil.
2. Set env vars (server-only, never `NEXT_PUBLIC_`):
   `WHATSAPP_PROVIDER=meta`, `WHATSAPP_ACCESS_TOKEN=…`,
   `WHATSAPP_PHONE_NUMBER_ID=…`, optionally `WHATSAPP_API_VERSION`,
   `WHATSAPP_MAX_ATTEMPTS`.
3. Redeploy. The queued backlog delivers on the next worker run.

`WHATSAPP_PROVIDER=log` writes messages to the server log (dev). `none`
(default) records but does not send — the app is fully functional either way.

**Swapping providers later** — add an adapter implementing `WhatsAppProvider`
under `src/server/integrations/notifications/`, add a case in `index.ts`, and
point `WHATSAPP_PROVIDER` at it. Nothing else changes.

**Consent / messaging policy** — only transactional order-lifecycle messages are
sent, to the number the customer gave at checkout. There is no bulk / marketing
path. Keep the registered templates strictly transactional to stay within
WhatsApp's rules.

## Cashfree automatic payment verification (Phase 10)

Optional, per partner. A partner who hasn't done this keeps the existing
static-QR / manual-verify flow — nothing breaks if you skip this.

**Onboard one partner (sandbox first, always):**

1. The partner creates their own Cashfree account at
   [cashfree.com](https://www.cashfree.com) and completes KYC (their own PAN,
   bank account). Their money settles to their own account, same as today.
2. In the Cashfree dashboard, switch to **Sandbox** (test mode, top-right
   toggle) and open Developers → API Keys. Copy the **App ID** and
   **Secret Key**.
3. Set two env vars in the hosting platform (Vercel), named by the partner's
   login code, e.g. for `PK`:
   `CASHFREE_APP_ID_PK=<app id>`
   `CASHFREE_SECRET_KEY_PK=<secret key>`
   Redeploy — these are server-only and are never sent to the browser.
4. In the Cashfree dashboard, Developers → Webhooks, add
   `https://<your domain>/api/payments/webhook/cashfree` for the
   `PAYMENT_SUCCESS_WEBHOOK` event (sandbox webhooks are configured
   separately from production ones — set this up in Sandbox mode first).
5. The partner opens **Payment account** in the console, sets "Automatic
   verification" to Cashfree, and saves.
6. Place a real test order through that partner's link (`/s/<code>`) and pay
   with a Cashfree sandbox test UPI id. Confirm the order reaches PAID
   automatically (no one clicks Verify) and a bill is issued.
7. **Before going live**, open the sandbox webhook's delivery log in the
   Cashfree dashboard and compare one real payload against
   `cashfreeWebhookSchema` in `src/server/integrations/payment/cashfree.ts` —
   the field names there are our best reading of Cashfree's public docs, not
   a live-verified payload, and should be confirmed once before real money is
   involved.
8. To go live: repeat steps 2–4 in **Production** mode (new App ID/Secret,
   new webhook URL registration), set `CASHFREE_ENV=PRODUCTION`, and update
   the same env vars with the production keys.

**If Cashfree is down, or a payment gets stuck** — the reconciliation sweep
(`/api/cron/reconcile-cashfree`, same `Bearer CRON_SECRET` pattern as the
other cron routes, call every 2–5 min) polls Cashfree directly for anything
stuck a few minutes; failing that, `payments.confirm_manual` on the Payments
screen always works as a fallback, for any partner, PSP or not.

**Turn Cashfree off for a partner** — Payment account → set "Automatic
verification" back to "Not set up" and save. Checkout falls back to their
static QR / manual verify immediately; no data is lost, no orders are
affected.

## Backups (to be enabled with the Supabase project)

- Supabase automated daily backups + Point-in-Time Recovery (paid tier).
- Additionally: a scheduled `pg_dump` to a separate bucket, 30-day retention.
- Test a restore into a scratch database quarterly. Record the date + result
  here.

| Date | Restore test result | By  |
| ---- | ------------------- | --- |
|      |                     |     |

## Common tasks

**Lock / unlock an account** — Staff management → account → Deactivate /
Reactivate. Deactivation revokes all their sessions immediately.

**A partner is locked out (too many failed logins)** — another partner opens
Staff management → the account → Reset password. This clears the lockout and
issues a new temporary password.

**Revoke a suspicious session** — Staff management → account → Active sessions →
revoke. Or reset the password to revoke all sessions at once.

**Investigate an action** — Audit log, filter by `actorCode` or `action`.
Entries cannot be edited or deleted (DB-enforced).

**Customer tracking link** — Order detail → Customer tracking. "Generate link"
shows the `/track/<token>` URL once (copy and send it); "Regenerate" replaces it
(older links stop working); "Revoke" disables tracking for that order. A leaked
link only ever exposes delivery progress and the LR PDF — no address, contact
details, or payment data. Requires `tracking.manage` (partners only). Filter the
audit log by `action` `tracking.token_*` to see the history.

**A customer did not get a WhatsApp message** — Notifications (partner-only).
Find the row by order/bill number. `SKIPPED` = no valid mobile on file (nothing
to do — call the customer). `FAILED`/`DEAD` = provider rejected it; check "Last
error", fix the cause (e.g. template not approved, number not on WhatsApp), then
"Retry". `PENDING` with "not configured" = set up the provider (see above).
Send a review request from the order detail page once the parcel is booked.

**Moderate a review** — Reviews (partner-only, `reviews.moderate`). Customers
submit a 1–5 star rating + optional comment from their tracking page once the
parcel is dispatched (one per order). "Hide" removes it from any public listing
but keeps it; "Delete" removes it entirely. Both are audit-logged. Reviews only
ever store a given name + city/state — no contact details.

**Complete an order** — Booking → order → "Mark completed" (needs the LR
uploaded). This is the final state; it also unlocks the review prompt.

**Ready to Book / parcel covers** — Booking → "Ready to Book →" (`booking.view`;
staff need the same permission the Booking Panel already requires). Shows
every paid + packed order waiting to be handed to a courier — it updates
itself automatically as orders are packed or booked, since it is just a
filtered view of the existing order status, not a separate list to maintain.
Filter by packed date, courier, partner, city, pincode, or free text; use
**Apply Filters** / **Reset**. **🖨 Print Cover** opens an A4 parcel label for
one order (or select rows and **🖨 Print Selected Covers** for several at
once); **🖨 Print Consolidated Report** and **Export CSV** both honour the
filters currently applied. A cover only ever shows what the customer's own
tracking page shows (name, address, courier, item count, a tracking QR) —
never payment details or internal booking remarks. An order disappears from
this list the moment it is successfully parcel-booked; if booking fails
validation, it stays here unchanged.

**Run a report** — Reports (partner-only, `reports.view`). Pick a date range
(≤ 400 days) and read daily/period sales, billing by login code, product-wise
sales, GST summary, payment summary, order-status and packing/booking counts,
cancellations, and stock movement. Figures cover **issued** bills; cancelled
bills are listed separately. Read-only — nothing here changes data.

**Investigate with the audit log** — Audit (partners see everything; staff see
only their own actions). Filter by free text (order/bill id or words in the
summary), action, actor code, entity type, and a date range. Entries are
append-only. Sensitive values (tokens, password hashes, credentials) are
redacted before storage; the customer phone in `order.create` is masked.

## Incident: suspected credential compromise

1. Reset the affected account's password (revokes all sessions).
2. If broader: deactivate affected accounts, then review the audit log for the
   window.
3. Rotate `DATABASE_URL` credentials and any integration secrets in the hosting
   platform.
4. Record timeline and actions taken.
