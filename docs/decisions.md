# Locked product & technical decisions

Agreed 2026-09-03. These drive the schema and architecture. Change only by
explicit follow-up decision.

| #   | Area              | Decision                                                                                                                                                                                                               | Phase |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Bill numbering    | Indian FY (Apr–Mar). Format `PK-2026-0001` (`<CODE>-<FY start year>-<seq4>`). Each login code has its own independent sequence, allocated atomically server-side. **Codes: PK, PSR, KA, S1, S2** (revised 2026-09-04). | 4     |
| 2   | Online orders     | On verified payment, auto-generate the bill under house partner code **PK** (configurable in Settings).                                                                                                                | 4–5   |
| 3   | Offline sales     | Walk-in / counter billing: product selection, customer details, payment mode, bill generation.                                                                                                                         | 4     |
| 4   | GST               | GST-ready: GSTIN, HSN, CGST/SGST/IGST, configurable tax rates. No hard-coded tax assumptions.                                                                                                                          | 2/4   |
| 5   | Shipping          | Charges configurable in Partner-only Settings. Flat / pincode / weight / free-shipping kept future-ready.                                                                                                              | 2/3   |
| 6   | Payment           | V1 = full prepaid online. Architecture ready for future advance/balance. No COD by default.                                                                                                                            | 5     |
| 7   | Stock             | Hard stock blocking; prevent overselling under concurrency; reserve/deduct safely after payment; record every movement. (See note A.)                                                                                  | 2/3/5 |
| 8   | Legal / logistics | Serviceable destinations and fulfilment restrictions are configurable. No assumption that every destination/transporter is permitted for fireworks.                                                                    | 3     |
| 9   | Delivery          | Pan-India design with configurable serviceable states/pincodes. Customer website supports **English + Tamil**.                                                                                                         | 2/3   |
| 10  | WhatsApp          | Provider-agnostic notification interface. Ready for Meta Cloud API or a BSP. Templates + outbox + retries. WhatsApp failure never blocks an order.                                                                     | 9     |
| 11  | Payment gateway   | Razorpay first, behind a `PaymentProvider` interface (future Cashfree/PhonePe). Verify webhook signature, server-side status, amount, currency, idempotency.                                                           | 5     |
| 12  | Hosting           | Vercel + Supabase/PostgreSQL. App stays portable. LR docs in private storage. No secrets in the repo.                                                                                                                  | 0     |
| 13  | Users             | 5 internal accounts — codes **PK, PSR, KA** (partners, full access), **S1, S2** (staff, restricted). RBAC enforced on the backend.                                                                                     | 1     |
| 14  | Tracking          | Cryptographically-random tokens. No order IDs or PII in tracking URLs. Links do not expire in V1; partners can revoke. Rate limited.                                                                                   | 7     |
| 15  | Reviews           | Secure on-site review page keyed by the tracking token. Rating 1–5 + optional comment. Google Business review integration kept future-ready.                                                                           | 10    |
| 16  | LR documents      | One current LR PDF per order in V1. Private storage; download only via an authorised endpoint. Re-upload replaces current while preserving history/audit.                                                              | 8     |
| 17  | Manual payment    | Partners can manually confirm offline/bank-transfer payments — mandatory reason + audit log. Staff cannot.                                                                                                             | 5     |
| 18  | Peak volume       | Design for ~500 orders/day and 10–20 concurrent internal users, scalable for Diwali peaks.                                                                                                                             | all   |
| 19  | Environments      | Local + Staging + Production, each with separate database and env vars.                                                                                                                                                | 0     |
| 20  | Refunds           | No automated refunds in V1. Partners refund via the Razorpay dashboard. Never mark an order refunded unless the provider confirms it.                                                                                  | 5     |

## Validation notes against the architecture

- **A. Stock (decision 7).** "Deduct after payment" alone cannot fully prevent
  two customers paying for the last unit. The design that satisfies both halves
  of the decision: **reserve** stock with a short-lived hold at checkout, then
  **commit** the reservation inside the same transaction that marks the order
  paid, and **release** on payment failure or hold expiry. All changes recorded
  in `inventory_movements`. To be implemented in Phases 2–5.
- **Bill numbering (decisions 1 & 2) — implemented Phase 4.** `bill_sequences`
  keyed by `(userCode, fiscalYear)` where `fiscalYear` is the FY's starting
  calendar year (e.g. `2026` for FY 2026-27) — the number renders as
  `PK-2026-0001`. Online-order bills allocate under `billing.housePartnerCode`
  (default `PK`); counter bills under the creator's own code. Each bill records
  `userCode`, `fiscalYear`, `sequenceNo`, and the (nullable) `createdById`.
  Migration `20260904090000_phase4_billing` also renames the seeded codes
  P1→PK, P2→PSR, P3→KA.
- **Manual payment (decision 17)** is modelled as a distinct state transition
  `AWAITING_PAYMENT → PAID` gated by `payments.confirm_manual`, requiring a
  reason, separate from the automatic gateway-verified transition.
- **Everything else** maps directly onto the agreed architecture with no
  conflict.
