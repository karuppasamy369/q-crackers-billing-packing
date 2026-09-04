import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/env";
import { logger } from "@/lib/logger";

/**
 * Cashfree Payment Gateway (UPI) adapter — Phase 10.
 *
 * Each partner onboards their OWN Cashfree account (their own KYC, their own
 * settlement bank account) so a verified payment lands directly with them,
 * same as the static-VPA flow it replaces. Credentials are per-partner env
 * vars, never stored in the database:
 *
 *   CASHFREE_APP_ID_<CODE>      e.g. CASHFREE_APP_ID_PK
 *   CASHFREE_SECRET_KEY_<CODE>  e.g. CASHFREE_SECRET_KEY_PK
 *
 * Endpoints and headers follow Cashfree's Orders API
 * (https://www.cashfree.com/docs/api-reference/payments/latest/orders/create)
 * and webhook signing
 * (https://www.cashfree.com/docs/payments/online/webhooks/signature-verification).
 * The exact field names in `CashfreeWebhookPayload` below are our best
 * understanding from public documentation, not a live-verified payload —
 * before taking a partner live, trigger one real sandbox payment and diff
 * the actual webhook body (visible in the Cashfree dashboard's webhook logs)
 * against this schema, and correct it if anything differs.
 */

export type CashfreeCredentials = { appId: string; secretKey: string };

/** Read a partner's Cashfree credentials from env. Null = not onboarded. */
export function getCashfreeCredentials(
  partnerCode: string,
): CashfreeCredentials | null {
  const code = partnerCode.trim().toUpperCase();
  const appId = process.env[`CASHFREE_APP_ID_${code}`];
  const secretKey = process.env[`CASHFREE_SECRET_KEY_${code}`];
  if (!appId || !secretKey) return null;
  return { appId, secretKey };
}

function baseUrl(): string {
  return env.CASHFREE_ENV === "PRODUCTION"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function authHeaders(creds: CashfreeCredentials): HeadersInit {
  return {
    "x-client-id": creds.appId,
    "x-client-secret": creds.secretKey,
    "x-api-version": env.CASHFREE_API_VERSION,
    "Content-Type": "application/json",
  };
}

/** Never let a Cashfree error response leak a secret we sent it back to us. */
function redact(text: string, creds: CashfreeCredentials): string {
  return text.split(creds.secretKey).join("[redacted]");
}

// ---------------------------------------------------------------------------
// Create order → payment_session_id (drives the customer-facing checkout)
// ---------------------------------------------------------------------------

export type CreateCashfreeOrderInput = {
  /** Our order's `reference` — used verbatim as Cashfree's `order_id`, so a
   *  webhook's `order_id` maps straight back to `Order.reference` with no
   *  extra column. */
  orderId: string;
  orderAmountPaise: number;
  customerPhone: string;
  customerName?: string;
  returnUrl: string;
  notifyUrl: string;
};

export type CreateCashfreeOrderResult = {
  cfOrderId: string;
  paymentSessionId: string;
};

const createOrderResponseSchema = z.object({
  cf_order_id: z.union([z.string(), z.number()]).transform(String),
  payment_session_id: z.string().min(1),
});

export async function createCashfreeOrder(
  creds: CashfreeCredentials,
  input: CreateCashfreeOrderInput,
): Promise<CreateCashfreeOrderResult> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/orders`, {
      method: "POST",
      headers: authHeaders(creds),
      body: JSON.stringify({
        order_id: input.orderId,
        order_amount: Number((input.orderAmountPaise / 100).toFixed(2)),
        order_currency: "INR",
        customer_details: {
          // Cashfree requires a customer_id; the order id is a fine stable
          // value here — it carries no extra customer PII.
          customer_id: input.orderId,
          customer_phone: input.customerPhone,
          ...(input.customerName ? { customer_name: input.customerName } : {}),
        },
        order_meta: {
          return_url: input.returnUrl,
          notify_url: input.notifyUrl,
        },
      }),
    });
  } catch (err) {
    logger.error("cashfree.create_order.network_error", {
      orderId: input.orderId,
      error: err instanceof Error ? err.message : "network error",
    });
    throw new Error("Could not reach the payment provider. Please try again.");
  }

  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    logger.error("cashfree.create_order.failed", {
      orderId: input.orderId,
      status: res.status,
      body: redact(bodyText, creds).slice(0, 500),
    });
    throw new Error("The payment provider rejected the order. Please try again.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    logger.error("cashfree.create_order.unparsable_response", {
      orderId: input.orderId,
    });
    throw new Error("The payment provider returned an unexpected response.");
  }

  const data = createOrderResponseSchema.parse(parsed);
  return { cfOrderId: data.cf_order_id, paymentSessionId: data.payment_session_id };
}

// ---------------------------------------------------------------------------
// Order payments (status lookup — used by the reconciliation sweep)
// ---------------------------------------------------------------------------

export type CashfreeOrderPayment = {
  cfPaymentId: string;
  status: string;
  amountPaise: number;
  bankReference: string | null;
};

const paymentEntrySchema = z.object({
  cf_payment_id: z.union([z.string(), z.number()]).transform(String),
  payment_status: z.string(),
  payment_amount: z.number(),
  bank_reference: z.string().nullable().optional(),
});

const paymentsListSchema = z.array(paymentEntrySchema);

/** GET /pg/orders/{order_id}/payments — every payment attempt for an order. */
export async function getCashfreeOrderPayments(
  creds: CashfreeCredentials,
  cfOrderId: string,
): Promise<CashfreeOrderPayment[]> {
  let res: Response;
  try {
    res = await fetch(
      `${baseUrl()}/orders/${encodeURIComponent(cfOrderId)}/payments`,
      { headers: authHeaders(creds) },
    );
  } catch (err) {
    logger.warn("cashfree.get_payments.network_error", {
      cfOrderId,
      error: err instanceof Error ? err.message : "network error",
    });
    throw new Error("Could not reach the payment provider.");
  }

  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    logger.warn("cashfree.get_payments.failed", {
      cfOrderId,
      status: res.status,
      body: redact(bodyText, creds).slice(0, 500),
    });
    throw new Error("The payment provider could not return this order's status.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error("The payment provider returned an unexpected response.");
  }

  const rows = paymentsListSchema.parse(parsed);
  return rows.map((r) => ({
    cfPaymentId: r.cf_payment_id,
    status: r.payment_status,
    amountPaise: Math.round(r.payment_amount * 100),
    bankReference: r.bank_reference ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Webhook signature verification + payload shape
// ---------------------------------------------------------------------------

/**
 * Cashfree signs `x-webhook-timestamp + <raw body>` with HMAC-SHA256, base64
 * encoded, using the SAME secret key used for API auth (Cashfree does not
 * issue a separate webhook secret for the Payment Gateway product). Always
 * verify against the exact raw request body — not a re-serialised object.
 */
export function verifyCashfreeWebhookSignature(params: {
  rawBody: string;
  timestamp: string;
  signature: string;
  secretKey: string;
}): boolean {
  const expected = createHmac("sha256", params.secretKey)
    .update(params.timestamp + params.rawBody)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(params.signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Best-effort schema for a PAYMENT_*_WEBHOOK body — see the file header note
 *  about verifying this against a real sandbox payload before going live. */
export const cashfreeWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    order: z.object({
      order_id: z.string().min(1),
      order_amount: z.number(),
    }),
    payment: z
      .object({
        cf_payment_id: z.union([z.string(), z.number()]).transform(String),
        payment_status: z.string(),
        payment_amount: z.number(),
        bank_reference: z.string().nullable().optional(),
      })
      .optional(),
  }),
});
export type CashfreeWebhookPayload = z.infer<typeof cashfreeWebhookSchema>;

/**
 * Pull just the `order_id` out of an otherwise-unverified webhook body, so the
 * caller knows which order (and therefore which partner / secret key) to
 * verify the signature against. This value is NOT trusted for anything except
 * choosing which secret to check — every field is re-validated with
 * {@link cashfreeWebhookSchema} only after the signature passes.
 */
export function peekWebhookOrderId(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody);
    const orderId = parsed?.data?.order?.order_id;
    return typeof orderId === "string" && orderId.length > 0 ? orderId : null;
  } catch {
    return null;
  }
}
