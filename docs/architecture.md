# Architecture (reference)

Condensed from the approved plan. Full rationale lives in the planning
conversation; this is the working reference.

## Shape

One Next.js app, two surfaces:

- **Storefront** (public, no login): `/`, `/products`, `/cart`, `/checkout`,
  `/track/<token>`, `/review/<token>` — later phases.
- **Console** (`/app/*`, login + RBAC): dashboard, catalogue, orders, billing,
  booking, customers, reports, staff, settings, audit.

## Layers

```
UI (RSC + client components)
  └─ Server Actions / Route Handlers   ← re-check auth + permission here
       └─ Service layer                ← business rules, state machine, the ONLY DB caller
            └─ Prisma → PostgreSQL
       └─ Integration adapters         ← PaymentProvider, StorageProvider, NotificationProvider
```

Rule: no page or component imports `src/server/db`. Everything goes through a
service. Authorization is checked in the service **and** at the action/route
boundary — the UI hiding a control is cosmetic only.

## External integrations (later phases, all behind interfaces)

- **Payments (Phase 5 — implemented)** — provider-agnostic UPI, NO Razorpay.
  Per-partner `PartnerPaymentAccount` (VPA / payee / optional static QR).
  Checkout renders an amount-filled UPI QR + deep link for the order's assigned
  partner; the customer submits their UTR (`payments` row, status `SUBMITTED`);
  an authorised partner verifies it (`payments.confirm_manual`) against the
  collecting account. `PaymentVerifier` interface
  (`src/server/integrations/payment/verifier.ts`) ships `MANUAL` only, with
  `lookup` / `parseWebhook` hooks for a future bank/PSP adapter — a verified
  payment always ends as `PaymentStatus.VERIFIED` + a `verificationMethod`.
  Verification asserts right-order + amount-match + UTR-once idempotency, then
  in one txn: commit reserved stock as a `SALE` movement, mark the order `PAID`,
  write history + audit; the bill is auto-issued under the order's assigned
  partner immediately after. Expired unpaid holds are swept by
  `/api/cron/release-holds` (Bearer `CRON_SECRET`) — but an order with a
  `SUBMITTED` or `VERIFIED` payment is never auto-failed.
- **StorageProvider** — Supabase Storage private buckets. Random keys, signed
  URLs minted server-side after an authorization check.
- **NotificationProvider** — WhatsApp. Business events write to
  `notification_outbox` in the same transaction as the state change; a worker
  delivers with retries. Provider outage never blocks an order.

## Order state machine (later phases)

```
AWAITING_PAYMENT ──(gateway verified | manual confirm*)──▶ PAID
      │                                                     │
      └──(gateway failure)──▶ PAYMENT_FAILED                │ booking.pack
                                                            ▼
                                                          PACKED
                                                            │ booking.book_parcel (courier, LR#, date, count)
                                                            ▼
                                                     PARCEL_BOOKED
                                                            │ LR uploaded + confirmed
                                                            ▼
                                                        COMPLETED

any ──(partner: orders.cancel / orders.override_state, reason required)──▶ CANCELLED / adjusted
```

`*` manual confirm = `payments.confirm_manual`, partner-only, reason mandatory.

Every transition writes `order_status_history` + `audit_logs` + the relevant
`tracking_events` + `notification_outbox` rows, in one transaction. Invalid
transitions return 409 and change nothing.

## Bill numbering (Phase 4 — implemented)

`<CODE>-<FY>-<SEQ4>`, e.g. `PK-2026-0001`. `<FY>` is the Indian financial
year's **starting calendar year** (`indianFiscalYear()`, April–March). Login
codes: **PK, PSR, KA, S1, S2**. Allocation runs inside the bill transaction:

```sql
INSERT INTO bill_sequences ("userCode", "fiscalYear", "lastNumber", "updatedAt", "createdAt")
VALUES ($1, $2, 1, now(), now())
ON CONFLICT ("userCode", "fiscalYear")
DO UPDATE SET "lastNumber" = bill_sequences."lastNumber" + 1, "updatedAt" = now()
RETURNING "lastNumber";
```

Atomic, race-safe (ON CONFLICT row lock), per-code series. Cancelled bills keep
their number and the counter never decrements — numbers are never reused.
Online-order bills allocate under `billing.housePartnerCode` (default `PK`);
counter bills under the creating user's own code.

## Data model — implemented (Phases 1–4)

Phase 1: `roles`, `permissions`, `role_permissions`, `user_permissions`,
`users`, `sessions`, `audit_logs` (DB trigger rejects UPDATE/DELETE).

Phase 2: `settings` (typed key/value — registry in
`src/lib/settings/registry.ts`), `categories`, `products`, `product_images`,
`inventory`, `inventory_movements`. Money is `Int` paise; GST rate is `Int`
basis points; `CHECK` constraints enforce non-negativity, and a partial unique
index enforces one primary image per product.

Storage: `StorageProvider` interface with a `filesystem` driver (dev) and a
private-bucket `supabase` driver. Product images are served only through
`/api/media/product-images/[id]`, which allows public reads for published
products and requires `products.view` otherwise.

Phase 3: `customers`, `orders`, `order_items`, `order_status_history`.
`CHECK` constraints keep order money non-negative and the totals internally
consistent. The cart lives in the browser as `{ slug, quantity }` pairs only;
`pricing-service.quoteCart` is the single server-authoritative price/tax/
shipping calculation (shared by the cart page and checkout). `createOnlineOrder`
runs one transaction: lock inventory rows → verify availability → reserve
(`quantityReserved += qty`) → create order + items + status history + audit. The
customer confirmation page is reached via a 24-byte random `orders.reference`
(no sequential id exposed). `PaymentProvider` is the interface Phase 5's
Razorpay adapter implements.

Phase 4: `bills`, `bill_items`, `bill_sequences`. Bill money and the CGST/SGST
vs IGST split are locked down by `CHECK` constraints. `billing-service` issues
bills for a paid online order (house code) or as a counter sale (own code);
counter sales move stock (`SALE` / `RETURN` movements) inside the same
transaction as the bill. Invoice PDFs render with `@react-pdf/renderer`
(`React.createElement`, no JSX) and are cached in the private bucket, served via
`/api/billing/[id]/pdf` behind `billing.view`.

Phase 5: `payments`, `partner_payment_accounts`; `orders.assignedPartnerId` /
`assignedPartnerCode` (set once at checkout — `/s/<code>` link order → that
partner, else the house partner — and frozen by a DB trigger). Partial unique
indexes enforce one live payment per order and one recorded UTR globally; a
`CHECK` keeps amounts positive and verified/rejected rows timestamped.
`ORDER_HOLD_MINUTES` raised to 1440 (manual verification takes longer than a
gateway redirect).

Phase 7: `tracking_tokens` (one per order). Stores only the SHA-256 hex hash of
a 256-bit base64url token — the raw token is never persisted, so a database leak
yields no working tracking links. `tracking-service` owns the whole lifecycle:
`ensureTrackingTokenForOrder` (idempotent, races resolved by the `orderId`
unique index), `regenerateTrackingToken` / `revokeTrackingToken`
(`tracking.manage`), and the public `getPublicTrackingByToken` /
`getPublicTrackingLrByToken` — hash-based lookup, IP rate-limited, one generic
`NOT_FOUND` for every failure (wrong / revoked / expired token, unpaid or
non-existent order) so token enumeration reveals nothing. `PublicTrackingDto` is
an explicit, typed, minimal shape — status, stage timeline (built from
`order_status_history` + booking timestamps), courier / LR / booking date /
parcel count, an opaque `publicRef` display code, and city+state only — never an
address, phone, name, email, DB id, order reference, or payment data. The
customer reaches it from their confirmation page (which also offers a rotate-to-
reveal shareable `/track/<token>` link); staff manage it from the order detail
page. `/track/*` responses are `no-store`, `noindex`, `Referrer-Policy:
no-referrer`.

Phase 6: `bookings` (one per order — courier / LR number / booking date /
parcel count / remarks, plus `packedAt`/`parcelBookedAt` and their actors),
`lr_documents` (uploaded LR PDFs; re-upload marks the previous row
`isCurrent = false` with `supersededAt`). A DB `CHECK` blocks a `parcelBookedAt`
without all four mandatory courier fields; a partial unique index keeps at most
one current LR per order. State machine: `PAID → PACKED` (`booking.pack`) →
`PARCEL_BOOKED` (`booking.book_parcel`, four fields validated in the service and
the DB). `booking-service` owns every transition — each writes
`order_status_history` + `audit_logs` in one transaction. LR PDFs live in the
private bucket (`lr-docs/`), validated by magic bytes + `%%EOF` + a
`STORAGE_MAX_DOCUMENT_BYTES` cap, streamed only through `/api/lr/[orderId]/pdf`
(`lr.download`, audited) or a customer tracking route (see Phase 7). The customer
tracking page shows "Download LR Copy" only once a current LR document exists.

## Data model — later phases (planned)

`payment_webhook_events`, `notification_outbox`, `notification_receipts`,
`reviews`.

## Sessions

Opaque random token in an httpOnly cookie; DB row holds only its SHA-256 hash,
an idle `expiresAt` (slid forward on activity, throttled) and an
`absoluteExpiresAt` cap. Revocation is a column update, so it is instant and
works from the staff-management screen.
