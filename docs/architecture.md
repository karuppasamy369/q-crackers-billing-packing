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

- **PaymentProvider** — Razorpay first. Webhook signature + server-side status +
  amount + currency + idempotency before an order is treated as paid.
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

## Bill numbering

`<CODE>-<FY>-<SEQ4>`, e.g. `P1-2026-27-0001`. Allocation inside the
bill-issuing transaction:

```sql
INSERT INTO bill_sequences (user_code, fiscal_year_label, last_number)
VALUES ($1, $2, 1)
ON CONFLICT (user_code, fiscal_year_label)
DO UPDATE SET last_number = bill_sequences.last_number + 1
RETURNING last_number;
```

Atomic, race-safe, per-login series. Cancelled bills keep their number.

## Data model — implemented (Phases 1–2)

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

## Data model — later phases (planned)

`customers`, `orders`, `order_items`, `order_status_history`, `payments`,
`payment_webhook_events`, `bills`, `bill_sequences`, `bookings`,
`lr_documents`, `tracking_tokens`, `tracking_events`, `notification_outbox`,
`notification_receipts`, `reviews`.

## Sessions

Opaque random token in an httpOnly cookie; DB row holds only its SHA-256 hash,
an idle `expiresAt` (slid forward on activity, throttled) and an
`absoluteExpiresAt` cap. Revocation is a column update, so it is instant and
works from the staff-management screen.
