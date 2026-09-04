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
   (default 10 MB) caps LR / tracking PDF uploads. Phase 7 adds no new secrets.
3. Run `npx prisma migrate deploy`.
4. Run `npm run db:seed` **once**. Capture the printed temporary passwords and
   distribute them to each partner/staff member over a secure channel.
5. Confirm each account is forced to change password on first sign-in.

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

## Incident: suspected credential compromise

1. Reset the affected account's password (revokes all sessions).
2. If broader: deactivate affected accounts, then review the audit log for the
   window.
3. Rotate `DATABASE_URL` credentials and any integration secrets in the hosting
   platform.
4. Record timeline and actions taken.
