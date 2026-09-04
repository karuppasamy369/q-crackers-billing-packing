-- Phase 10 — Cashfree automatic UPI verification (per-partner accounts).
-- Additive and non-destructive: two nullable columns. Null pspProvider means
-- "not onboarded yet" — that partner keeps using the existing static-QR /
-- manual-verify flow (hybrid rollout). No secret material is stored here —
-- API keys live only in env vars, keyed by partner code.

ALTER TABLE "partner_payment_accounts"
  ADD COLUMN "pspProvider" TEXT,
  ADD COLUMN "pspAccountId" TEXT;
