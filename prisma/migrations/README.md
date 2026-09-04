# Migrations

Migrations are **authored, reviewed, and committed** — never generated on a
developer's machine at apply time.

## Workflow

1. Edit `prisma/schema.prisma`.
2. `npm run db:migration:new -- <snake_case_name>` — generates the
   table/column diff into a new timestamped folder. (Needs a reachable
   Postgres for the throwaway shadow database — the docker-compose one is fine.)
3. Open the generated `migration.sql`. Add anything Prisma's schema language
   cannot express, **below the marked line**:
   - `CHECK` constraints (money ≥ 0, stock ≥ 0, GST rate range, …)
   - partial / expression indexes (e.g. one primary image per product)
   - triggers (e.g. `audit_logs` append-only enforcement)
4. Commit the migration with the schema change.

## Applying

- Everywhere (local, CI, staging, production): `npm run prisma:migrate`
  (`prisma migrate deploy`). It runs pending migration files in order and does
  nothing else — no drift checks, no prompts.
- `prisma migrate dev` is intentionally **not** used: it would try to "correct"
  the hand-written constraints back out of the database.

## Current migrations

| Folder                              | Adds                                                       |
| ----------------------------------- | --------------------------------------------------------- |
| `20260903000000_init`               | RBAC, users, sessions, audit_logs (+ append-only trigger) |
| `20260903090000_phase2_catalogue`   | settings, categories, products, product_images, inventory, inventory_movements (+ CHECK constraints, one-primary-image index) |
| `20260903120000_phase3_orders`      | customers, orders, order_items, order_status_history (+ money/consistency CHECK constraints) |
| `20260904090000_phase4_billing`     | bills, bill_items, bill_sequences (+ number/GST/consistency CHECK constraints); renames partner login codes P1→PK, P2→PSR, P3→KA |
| `20260904140000_phase5_payments`    | payments, partner_payment_accounts; `orders.assignedPartnerId/Code` (+ immutability trigger); one-active-payment-per-order and unique-UTR partial indexes |
| `20260904160000_phase6_booking`     | bookings, lr_documents; CHECK that PARCEL_BOOKED requires the four courier fields; one-current-LR-per-order partial index |
| `20260904180000_phase7_tracking_tokens` | tracking_tokens (hash-only public tracking credential, one per order); CHECK that `tokenHash` is a 64-char SHA-256 hex digest |
| `20260904200000_phase8_notifications` | notification_outbox + enums; `tracking_tokens.linkVersion`; `orders.locale`; CHECKs on attempt counters, E.164 recipient, SENT-has-timestamp |
| `20260904220000_phase9_reviews` | reviews table + `ReviewStatus` enum; CHECKs on rating (1–5), comment length, moderation consistency |
