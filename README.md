# Q Crackers

Production web application for the Q Crackers fireworks business: a public
storefront plus an internal operations console (billing, booking, parcel
tracking).

**Current status:** Phases 0–4 complete.

- **Phase 0/1** — foundation, authentication, roles & permissions (RBAC),
  database-backed sessions, append-only audit log.
- **Phase 2** — catalogue: categories, products, pricing, product images
  (private storage), inventory with a movement ledger, business settings, and a
  public English/Tamil storefront.
- **Phase 3** — cart (browser-side, slug + quantity only), server-authoritative
  pricing/tax/shipping quote, checkout with customer details + fulfilment
  checks, atomic order creation with stock reservation, order confirmation page,
  and a read-only internal Orders view.
- **Phase 4** — billing: `bills` + `bill_sequences`, per-code atomic bill-number
  allocation (`PK-2026-0001`), GST tax invoices (CGST/SGST or IGST), counter /
  walk-in bills, online-order bills under the house partner code, cancel
  (keeps the number), and `@react-pdf/renderer` invoice PDFs. The five login
  codes are **PK / PSR / KA / S1 / S2**.

Later phases (payment, booking, tracking, WhatsApp) are not built yet. Razorpay
slots into the `PaymentProvider` seam at Phase 5.

---

## Tech stack

| Concern          | Choice                                            |
| ---------------- | ------------------------------------------------- |
| Framework        | Next.js 15 (App Router) + React 19 + TypeScript   |
| Build            | Turbopack (`next build --turbopack`)              |
| Database         | PostgreSQL (Supabase for staging/prod)            |
| DB access        | Prisma 6 (`src/generated/prisma`)                 |
| Auth             | Hand-rolled, DB-backed opaque sessions            |
| Password hashing | Argon2id (`@node-rs/argon2`)                      |
| Validation       | Zod                                               |
| Styling          | Tailwind CSS v4                                   |
| Tests            | Vitest (unit) + Postgres-backed integration in CI |

Why hand-rolled sessions instead of a library: `next-auth` v5 is still a release
candidate, and the requirement for **instant partner-initiated revocation** of
any account's sessions is met cleanly by storing session state in the database.
Tokens are 256-bit random, stored only as a SHA-256 hash.

---

## Local development

### 1. Prerequisites

- Node.js 20.11+ (22 LTS recommended)
- A PostgreSQL 16 database. Easiest: Docker.

```bash
docker compose up -d        # starts Postgres on localhost:5432
```

If you cannot use Docker, install PostgreSQL locally or point `DATABASE_URL`
at any Postgres instance.

### 2. Configure environment

```bash
cp .env.example .env
# .env already has working values for the docker-compose database.
```

### 3. Install, migrate, seed

```bash
npm install
npm run prisma:migrate          # applies prisma/migrations
npm run db:seed                 # creates roles, permissions, and P1/P2/P3/S1/S2
```

The seed prints **temporary passwords once**. Each account must set a new
password on first sign-in. To use fixed passwords instead, set
`SEED_PARTNER1_PASSWORD` etc. in `.env` before seeding.

`.env` also sets `SEED_SAMPLE_CATALOGUE=1`, so the seed adds a small demo
catalogue (two categories, four products, stock) — remove it for a clean
database.

### 4. Run

```bash
npm run dev                     # http://localhost:3000
```

- `/` — public storefront (product listing, category filter, product detail).
- `/login` → `/app/*` — internal console.

Product images use the `filesystem` storage driver in dev (files under
`.storage/`, git-ignored, served only through `/api/media/...`). Staging and
production set `STORAGE_DRIVER=supabase` with a **private** bucket.

---

## Scripts

| Script                               | Purpose                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `npm run dev`                        | Dev server (Turbopack)                                     |
| `npm run build`                      | `prisma generate` + production build                       |
| `npm run start`                      | Serve the production build                                 |
| `npm run typecheck`                  | `tsc --noEmit`                                             |
| `npm run lint`                       | ESLint (via `next lint`)                                   |
| `npm run test`                       | Vitest — unit always, integration if `TEST_DATABASE_URL`   |
| `npm run check`                      | typecheck + lint + test                                    |
| `npm run prisma:migrate`             | Apply pending migrations (`prisma migrate deploy`)         |
| `npm run db:migration:new -- <name>` | Author a new migration (see `prisma/migrations/README.md`) |
| `npm run db:seed`                    | Seed roles, permissions, accounts, settings                |

---

## Environments

Three fully separate environments, each with its own database and secrets:

| Environment | Hosting (planned)        | Database                      |
| ----------- | ------------------------ | ----------------------------- |
| local       | your machine             | docker-compose Postgres       |
| staging     | Vercel (preview/staging) | Supabase project (staging)    |
| production  | Vercel                   | Supabase project (production) |

Secrets are set in the hosting platform, never committed. `.env*` files are
git-ignored except `.env.example`.

---

## Project layout

```
prisma/                 schema, migrations (authored + committed), seed
src/
  app/
    (storefront)/        public site — no auth (/, /products/[slug])
    (console)/           internal console — auth-gated, RBAC-enforced
    login/               sign-in
    api/health/          liveness + DB probe
    api/media/           authorised product-image streaming (private storage)
  server/                server-only code
    auth/                password hashing, session lifecycle, tokens
    rbac/                 authorization guards (requirePermission, …)
    services/            business logic — the only place that touches the DB
    integrations/storage/ StorageProvider interface + filesystem/Supabase
    storefront/          per-request locale + public settings
    http/                typed errors, request context, action-result
  lib/
    rbac/                permission catalogue + pure resolver (testable)
    settings/            settings registry (keys, schemas, defaults, public flag)
    i18n/                English + Tamil dictionaries
    validation/          Zod schemas
    money.ts             integer-paise helpers
    …
  middleware.ts          edge cookie gate (UX only; real checks are server-side)
docs/                    architecture, decisions, security, runbook
.github/workflows/ci.yml Postgres-backed CI
```

See `docs/` for the architecture, the locked product decisions, the security
control list, and the operations runbook.
