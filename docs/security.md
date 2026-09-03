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

| Control                                             | Status | Where                                          |
| --------------------------------------------------- | ------ | ---------------------------------------------- |
| Strict security headers (CSP, HSTS, XFO, …)         | ✅     | `next.config.ts` (unit-tested)                 |
| `x-powered-by` removed                              | ✅     | `next.config.ts`                               |
| Env validated at startup                            | ✅     | `src/env.ts` (Zod)                             |
| No secrets in the repo                              | ✅     | `.gitignore`, `.env.example` only              |
| Input validation at every boundary                  | ✅     | Zod on all actions/services                    |
| Parameterised queries                               | ✅     | Prisma (no raw string SQL in app code)         |
| Transaction-capable audit writes                    | ✅     | `recordAudit(..., client)` accepts a tx        |
| DB constraints (FK/unique/enum/checks)              | ✅     | `prisma/schema.prisma` + init migration        |
| HTTPS / TLS, backups, PITR                          | ⏳     | platform config — see `runbook.md`             |
| Protected file access for LR PDFs                   | ⏳     | Phase 8 (private bucket + signed URL endpoint) |
| Payment verification (signature/amount/idempotency) | ⏳     | Phase 5                                        |
| Secure tracking tokens                              | ⏳     | Phase 7 (same primitive as `tokens.ts`)        |

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

## Known Phase 1 limitations

- Rate limiting is per-process. On multi-instance hosting it is a soft layer;
  the per-account DB lockout is the hard guarantee. Phase 10 adds a shared
  store (Upstash Redis) for public endpoints.
- `next lint` is used for now; it is deprecated in Next 16 and will be migrated
  to the ESLint CLI.
- Integration tests require Postgres and run in CI; they are skipped when
  `TEST_DATABASE_URL` is unset.
