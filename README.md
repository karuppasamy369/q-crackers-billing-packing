# Q Crackers

Production web application for the Q Crackers fireworks business: a public
storefront plus an internal operations console (billing, booking, parcel
tracking).

**Current status:** Phase 0 + Phase 1 complete — project foundation,
authentication, roles & permissions (RBAC), database-backed sessions, and an
append-only audit log. Later phases (catalogue, checkout, payment, billing,
booking, tracking, WhatsApp) are not built yet.

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

### 4. Run

```bash
npm run dev                     # http://localhost:3000
```

Sign in at `/login`. `/` redirects to the console or the login page.

---

## Scripts

| Script                   | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `npm run dev`            | Dev server (Turbopack)                                   |
| `npm run build`          | `prisma generate` + production build                     |
| `npm run start`          | Serve the production build                               |
| `npm run typecheck`      | `tsc --noEmit`                                           |
| `npm run lint`           | ESLint (via `next lint`)                                 |
| `npm run test`           | Vitest — unit always, integration if `TEST_DATABASE_URL` |
| `npm run check`          | typecheck + lint + test                                  |
| `npm run prisma:migrate` | Create/apply a migration in dev                          |
| `npm run prisma:deploy`  | Apply migrations (staging/prod)                          |
| `npm run db:seed`        | Seed roles, permissions, and the 5 accounts              |

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
prisma/                 schema, migrations, seed
src/
  app/
    (console)/           internal console — auth-gated, RBAC-enforced
    login/               sign-in
    api/health/          liveness + DB probe
  server/                server-only code
    auth/                password hashing, session lifecycle, tokens
    rbac/                 authorization guards (requirePermission, …)
    services/            business logic — the only place that touches the DB
    http/                typed errors, request context
  lib/
    rbac/                permission catalogue + pure resolver (testable)
    validation/          Zod schemas
    …
  middleware.ts          edge cookie gate (UX only; real checks are server-side)
docs/                    architecture, decisions, security, runbook
.github/workflows/ci.yml Postgres-backed CI
```

See `docs/` for the architecture, the locked product decisions, the security
control list, and the operations runbook.
