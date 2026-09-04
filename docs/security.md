# Security controls

Status of each control from the agreed security architecture. ✅ = implemented
in Phase 1, ⏳ = designed, lands in a later phase.

## Authentication & sessions

| Control                                        | Status | Where                                                             |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Argon2id password hashing                      | ✅     | `src/server/auth/password.ts` (19 MiB, t=2)                       |
| Password strength policy (≥12, mixed)          | ✅     | `src/lib/validation/common.ts`                                    |
| Forced password change on first login          | ✅     | `users.mustChangePassword`, console layout gate                   |
| Opaque 256-bit session tokens                  | ✅     | `src/server/auth/tokens.ts`                                       |
| Only a SHA-256 hash of the token stored        | ✅     | `sessions.tokenHash`                                              |
| DB-backed sessions, instant revocation         | ✅     | `revokeSession`, `revokeAllSessionsForUser`                       |
| Idle timeout + absolute cap, sliding renewal   | ✅     | `getCurrentAuth` (env-configurable)                               |
| httpOnly + Secure (prod) + SameSite=Lax cookie | ✅     | `src/server/auth/session.ts`                                      |
| Failed-login lockout (N attempts / window)     | ✅     | `auth-service.login`, env-configurable                            |
| Generic login error (no user enumeration)      | ✅     | constant-time dummy hash on unknown email                         |
| Best-effort login rate limiting                | ✅     | `src/lib/rate-limit.ts` (per-instance; global store in Phase 10)  |
| TOTP 2FA for partners                          | ⏳     | `users.totpSecret` column reserved                                |
| CSRF                                           | ✅     | Next.js Server Actions (Origin check) — all mutations are actions |

## Authorization (RBAC)

| Control                                             | Status | Where                                                |
| --------------------------------------------------- | ------ | ---------------------------------------------------- |
| Roles + permissions + per-user overrides            | ✅     | Prisma models, `prisma/seed.ts`                      |
| Deny-by-default resolver, DENY beats ALLOW          | ✅     | `src/lib/rbac/resolve.ts` (unit-tested)              |
| Partners always retain full access                  | ✅     | resolver special-case + write guard                  |
| Server-side enforcement on every mutation           | ✅     | `requirePermission` in each service                  |
| Enforcement independent of the UI                   | ✅     | services throw `ForbiddenError` regardless of caller |
| Module route guards                                 | ✅     | every console page re-checks its permission          |
| Edge middleware is UX-only, not a security boundary | ✅     | `src/middleware.ts` (documented)                     |

## Audit log

| Control                                                | Status | Where                                             |
| ------------------------------------------------------ | ------ | ------------------------------------------------- |
| Important actions recorded with actor/role/entity/time | ✅     | `recordAudit`, called across auth + user services |
| Append-only at the database level                      | ✅     | `audit_logs` UPDATE/DELETE trigger (migration)    |
| Secrets redacted before writing                        | ✅     | `src/lib/redact.ts` (unit-tested)                 |
| Monotonic ordering independent of clock                | ✅     | `audit_logs.seq BIGSERIAL`                        |
| Staff see only their own entries                       | ✅     | `audit-query.listAuditLogs` hard-scopes           |

## Platform & data

| Control                                             | Status | Where                                                                                                                                                    |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict security headers (CSP, HSTS, XFO, …)         | ✅     | `next.config.ts` (unit-tested)                                                                                                                           |
| `x-powered-by` removed                              | ✅     | `next.config.ts`                                                                                                                                         |
| Env validated at startup                            | ✅     | `src/env.ts` (Zod)                                                                                                                                       |
| No secrets in the repo                              | ✅     | `.gitignore`, `.env.example` only                                                                                                                        |
| Input validation at every boundary                  | ✅     | Zod on all actions/services                                                                                                                              |
| Parameterised queries                               | ✅     | Prisma (no raw string SQL in app code)                                                                                                                   |
| Transaction-capable audit writes                    | ✅     | `recordAudit(..., client)` accepts a tx                                                                                                                  |
| DB constraints (FK/unique/enum/checks)              | ✅     | `prisma/schema.prisma` + init migration                                                                                                                  |
| HTTPS / TLS, backups, PITR                          | ⏳     | platform config — see `runbook.md`                                                                                                                       |
| Protected file access for LR PDFs                   | ✅     | Phase 6/7 — private `lr-docs/` bucket, streamed via `/api/lr/[orderId]/pdf` (`lr.download`) or a rate-limited tracking route; storage keys never exposed |
| Payment verification (signature/amount/idempotency) | ✅     | Phase 5 — `verifyPayment` asserts order + amount, UTR-once, idempotent                                                                                   |
| Secure tracking tokens                              | ✅     | Phase 7 — see the Customer tracking table below                                                                                                          |

## Catalogue & storage (Phase 2)

| Control                                                | Status | Where                                                                                                  |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------ |
| Staff cannot create/edit/delete products or categories | ✅     | `products.manage` — enforced in every service method (integration-tested → 403)                        |
| Staff cannot change prices                             | ✅     | `prices.manage` gates `updateProductPrice` separately                                                  |
| Staff cannot adjust stock                              | ✅     | `inventory.adjust` gates `adjustStock`                                                                 |
| Staff cannot change settings                           | ✅     | `settings.manage` gates `updateSettings`                                                               |
| Product images stored **private** by default           | ✅     | filesystem driver writes outside webroot; Supabase bucket is private; served only via `/api/media/...` |
| Storage credentials never sent to the browser          | ✅     | `SUPABASE_SERVICE_ROLE_KEY` is server-only; never `NEXT_PUBLIC_`                                       |
| Image uploads validated by magic bytes + size cap      | ✅     | `src/lib/image-validation.ts` (unit + integration tested); content-type/filename not trusted           |
| Media route enforces product visibility                | ✅     | published product → public; otherwise `products.view` required (integration-tested)                    |
| Storefront never exposes internal fields               | ✅     | `storefront-service` projects to a safe shape — no SKU, stock, cost or flags (integration-tested)      |
| Hidden / inactive products never reachable publicly    | ✅     | every public query filters `isVisibleOnline && isActive` (+ active category)                           |
| Money stored as integer paise, non-negative            | ✅     | `Int` columns + `CHECK` constraints in the migration                                                   |
| Stock cannot go negative / below reserved              | ✅     | service check + `SELECT … FOR UPDATE` + DB `CHECK`                                                     |
| Stock changes recorded in an append ledger             | ✅     | `inventory_movements` (balance-after ledger) + audit log                                               |
| Catalogue & settings changes audit-logged              | ✅     | `category.*`, `product.*`, `inventory.*`, `settings.update`                                            |
| Server Action body size bounded                        | ✅     | `serverActions.bodySizeLimit: "6mb"` (image uploads)                                                   |
| `noindex` on console / login; storefront indexable     | ✅     | route-segment `metadata.robots`                                                                        |

## Cart & checkout (Phase 3)

| Control                                                  | Status | Where                                                                                                                                                                 |
| -------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser never sends prices/totals — only slug + quantity | ✅     | cart schema is `{ slug, quantity }`; `pricing-service.quoteCart` looks up everything                                                                                  |
| All money recomputed server-side                         | ✅     | `computeOrderTotals` (unit-tested) runs for both the quote and the persisted order                                                                                    |
| Checkout input validated with Zod                        | ✅     | `checkoutSchema` — name, Indian mobile, address, GST state code, 6-digit pincode                                                                                      |
| Out-of-stock / hidden items cannot be ordered            | ✅     | quote marks the line unavailable; `createOnlineOrder` re-checks under `SELECT … FOR UPDATE` and aborts                                                                |
| Stock reserved atomically at checkout                    | ✅     | one transaction: lock rows → verify availability → `quantityReserved += qty` → order + items + history + audit; `CHECK (quantityReserved <= quantityOnHand)` backstop |
| Order totals internally consistent                       | ✅     | DB `CHECK`: `total = subtotal − discount + tax + shipping`, `lineTotal = lineSubtotal + lineTax`                                                                      |
| Fulfilment restrictions enforced                         | ✅     | blocked pincodes + serviceable state codes from settings                                                                                                              |
| Order creation rate-limited per connection               | ✅     | `rateLimit("order:create:<ip>", 8 / 10 min)` (per-instance; global store in Phase 10)                                                                                 |
| Customer-facing order lookup is capability-based         | ✅     | 24-byte random `reference`; no sequential id in the URL; `getOrderByReference` returns a projection with no internal ids                                              |
| No customer login                                        | ✅     | orders are anonymous; a `customers` row is keyed by normalised phone for history only                                                                                 |
| Razorpay seam prepared, not trusted yet                  | ✅     | `PaymentProvider` interface documents the Phase 5 rules (signature, server-side status, amount, idempotency)                                                          |

### Phase 3 limitation

- Reserved stock is not yet released automatically. Orders sit in
  `AWAITING_PAYMENT` with `holdExpiresAt` set; Phase 5 adds the release-on-fail
  path and a sweep for expired holds, and converts the reservation into a
  `SALE` movement on successful payment.

## Billing (Phase 4)

| Control                                         | Status | Where                                                                                                                     |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| Bill numbers generated server-side only         | ✅     | `billing-service.allocateBillNumber` — never in the browser                                                               |
| Atomic, gap-free per-code sequence              | ✅     | `INSERT … ON CONFLICT DO UPDATE … RETURNING` inside the bill transaction; `bill_sequences` PK is `(userCode, fiscalYear)` |
| No duplicate numbers under concurrency          | ✅     | the ON CONFLICT row lock serialises concurrent allocations (integration-tested in CI)                                     |
| Cancelled bills keep their number; never reused | ✅     | cancel sets `status = CANCELLED` only; the sequence counter never decrements                                              |
| `bill_number` unique constraint as a backstop   | ✅     | `bills.billNumber @unique`                                                                                                |
| Bill money is internally consistent             | ✅     | DB `CHECK`: `total = taxable + CGST + SGST + IGST + shipping + roundOff`, per-line too; `taxable = subtotal − discount`   |
| GST split matches supply type                   | ✅     | DB `CHECK`: intra-state ⇒ `igst = 0`; inter-state ⇒ `cgst = sgst = 0` (`splitGst`, unit + integration tested)             |
| Online-order bills use the house partner code   | ✅     | `billing.housePartnerCode` setting; the service also verifies that code is an actual PARTNER account                      |
| One bill per order                              | ✅     | `bills.orderId @unique`; `issueBillForOrder` is idempotent                                                                |
| Bill only for a paid order                      | ✅     | `issueBillForOrder` requires `order.paymentStatus = PAID`                                                                 |
| Counter sale moves stock atomically             | ✅     | one transaction: lock rows → decrement `quantityOnHand` → `SALE` movement; cancel reverses with a `RETURN` movement       |
| Billing permissions enforced server-side        | ✅     | `billing.create` for issuing, `billing.cancel` for cancelling (staff have create, not cancel — integration-tested → 403)  |
| Bill creation & cancellation audit-logged       | ✅     | `bill.issue` / `bill.cancel` audit entries with number, totals, reason                                                    |
| Bill PDFs stored privately                      | ✅     | `bills/…` prefix in the private bucket; served only via `/api/billing/[id]/pdf` behind `billing.view`                     |
| Immutable snapshots on the bill                 | ✅     | seller name/GSTIN/state, buyer details, HSN, rates and amounts are copied onto `bills` / `bill_items` at issue time       |

## Customer tracking (Phase 7)

| Control                                                     | Status | Where                                                                                                                      |
| ----------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Tracking credential is a 256-bit CSPRNG token (base64url)   | ✅     | `generateRandomToken(32)` (`src/server/auth/tokens.ts`); `/track/<token>`                                                  |
| Only the SHA-256 hash is stored — raw token never persisted | ✅     | `tracking_tokens.tokenHash` (`@unique`); DB `CHECK` rejects any value that is not 64 hex chars (integration-tested)        |
| No order id / bill number / phone / timestamp in the URL    | ✅     | token is unrelated to any order field; the page shows an opaque `publicRef` (`QC-` + hash prefix), never the reference     |
| Lookup is hash-based only                                   | ✅     | `getPublicTrackingByToken` → `findUnique({ tokenHash })`; the raw token is never compared or logged                        |
| One active token per order; rotation, not duplication       | ✅     | `orderId @unique`; `ensureTrackingTokenForOrder` is idempotent, `regenerate` replaces the hash in place                    |
| Concurrent token creation is safe                           | ✅     | `orderId` unique index + `P2002` catch → exactly one token (integration-tested)                                            |
| Revocation + expiry supported                               | ✅     | `revokeTrackingToken` (`tracking.manage`); `expiresAt` honoured on resolve (left null in V1 per decision 14)               |
| Generic response for invalid / revoked / expired / unpaid   | ✅     | single `NotFoundError("…not valid or has expired")`; identical message for a missing token and an existing unpaid order    |
| Token enumeration reveals nothing                           | ✅     | 256-bit space + constant generic error + no timing branch on "order exists" (integration-tested)                           |
| Unpaid / payment-failed orders are never publicly trackable | ✅     | `orderIsTokenEligible` requires `paymentStatus = PAID`; resolve re-checks (integration-tested)                             |
| Cancelled orders shown safely                               | ✅     | DTO `cancelled` flag, destination + courier suppressed (integration-tested)                                                |
| Public rate limiting                                        | ✅     | `rateLimit("track:view:<ip>", 60 / 10 min)`, `"track:lr:<ip>", 15 / 10 min`, `"track:rotate:<ip>", 10 / 10 min`            |
| Security headers on `/track/*`                              | ✅     | `next.config.ts` — `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` (+ global CSP/HSTS)  |
| Minimal, explicit, typed public DTO                         | ✅     | `PublicTrackingDto` — status, timeline, courier/LR, city+state, item count; no address, phone, name, email, IDs, or money  |
| LR download validates the doc belongs to the tracked order  | ✅     | `getPublicTrackingLrByToken` resolves the order via the token then loads that order's current LR only (integration-tested) |
| Status timeline is authoritative, not client-inferred       | ✅     | built server-side from `order_status_history` + `bookings`; no parallel status system                                      |
| Freshness — no stale booking/LR status                      | ✅     | `dynamic = "force-dynamic"`, `revalidate = 0`, `Cache-Control: no-store`                                                   |
| Token lifecycle audit-logged                                | ✅     | `tracking.token_issued` / `token_rotated` / `token_revoked` audit entries                                                  |
| Raw tokens are never logged                                 | ✅     | audit summaries and `logger` calls reference the order, never the token                                                    |
| No customer login required                                  | ✅     | fully anonymous; the token (or, for the customer's own confirmation page, the order reference) is the only capability      |

## Known Phase 1 limitations

- Rate limiting is per-process. On multi-instance hosting it is a soft layer;
  the per-account DB lockout is the hard guarantee. Phase 10 adds a shared
  store (Upstash Redis) for public endpoints.
- `next lint` is used for now; it is deprecated in Next 16 and will be migrated
  to the ESLint CLI.
- Integration tests require Postgres and run in CI; they are skipped when
  `TEST_DATABASE_URL` is unset.
