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
