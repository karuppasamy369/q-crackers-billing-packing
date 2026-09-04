import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  verifyCashfreeWebhookSignature,
  peekWebhookOrderId,
  cashfreeWebhookSchema,
  getCashfreeCredentials,
  createCashfreeOrder,
  getCashfreeOrderPayments,
} from "./cashfree";
import { createHmac } from "node:crypto";

const SECRET = "test-secret-key";

function sign(timestamp: string, rawBody: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
}

describe("verifyCashfreeWebhookSignature", () => {
  it("accepts a correctly signed body", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const timestamp = "1700000000";
    const signature = sign(timestamp, rawBody);
    expect(
      verifyCashfreeWebhookSignature({ rawBody, timestamp, signature, secretKey: SECRET }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const timestamp = "1700000000";
    const signature = sign(timestamp, rawBody);
    const tampered = JSON.stringify({ hello: "WORLD" });
    expect(
      verifyCashfreeWebhookSignature({
        rawBody: tampered,
        timestamp,
        signature,
        secretKey: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects a tampered timestamp", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const timestamp = "1700000000";
    const signature = sign(timestamp, rawBody);
    expect(
      verifyCashfreeWebhookSignature({
        rawBody,
        timestamp: "1700000001",
        signature,
        secretKey: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const timestamp = "1700000000";
    const signature = sign(timestamp, rawBody, "wrong-secret");
    expect(
      verifyCashfreeWebhookSignature({ rawBody, timestamp, signature, secretKey: SECRET }),
    ).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(
      verifyCashfreeWebhookSignature({
        rawBody: "{}",
        timestamp: "1",
        signature: "short",
        secretKey: SECRET,
      }),
    ).toBe(false);
  });
});

describe("peekWebhookOrderId", () => {
  it("extracts the order id from a well-formed body", () => {
    const body = JSON.stringify({ data: { order: { order_id: "abc123" } } });
    expect(peekWebhookOrderId(body)).toBe("abc123");
  });

  it("returns null for garbage JSON", () => {
    expect(peekWebhookOrderId("not json")).toBeNull();
  });

  it("returns null when the order id is missing", () => {
    expect(peekWebhookOrderId(JSON.stringify({ data: {} }))).toBeNull();
  });
});

describe("cashfreeWebhookSchema", () => {
  it("parses a well-formed PAYMENT_SUCCESS_WEBHOOK payload", () => {
    const payload = {
      type: "PAYMENT_SUCCESS_WEBHOOK",
      data: {
        order: { order_id: "abc123", order_amount: 500 },
        payment: {
          cf_payment_id: 12345,
          payment_status: "SUCCESS",
          payment_amount: 500,
          bank_reference: "UTR123456789",
        },
      },
    };
    const parsed = cashfreeWebhookSchema.parse(payload);
    expect(parsed.data.payment?.cf_payment_id).toBe("12345");
  });

  it("rejects a payload missing the order block", () => {
    expect(() =>
      cashfreeWebhookSchema.parse({ type: "X", data: {} }),
    ).toThrow();
  });
});

describe("getCashfreeCredentials", () => {
  const CODE = "TESTPARTNER";
  afterEach(() => {
    delete process.env[`CASHFREE_APP_ID_${CODE}`];
    delete process.env[`CASHFREE_SECRET_KEY_${CODE}`];
  });

  it("returns null when not configured", () => {
    expect(getCashfreeCredentials(CODE)).toBeNull();
  });

  it("returns credentials once both env vars are set", () => {
    process.env[`CASHFREE_APP_ID_${CODE}`] = "app-id-123";
    process.env[`CASHFREE_SECRET_KEY_${CODE}`] = "secret-456";
    expect(getCashfreeCredentials(CODE)).toEqual({
      appId: "app-id-123",
      secretKey: "secret-456",
    });
  });

  it("is case-insensitive on the partner code", () => {
    process.env[`CASHFREE_APP_ID_${CODE}`] = "app-id-123";
    process.env[`CASHFREE_SECRET_KEY_${CODE}`] = "secret-456";
    expect(getCashfreeCredentials(CODE.toLowerCase())).toEqual({
      appId: "app-id-123",
      secretKey: "secret-456",
    });
  });
});

describe("createCashfreeOrder / getCashfreeOrderPayments (mocked network)", () => {
  const creds = { appId: "app-id", secretKey: "secret" };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createCashfreeOrder sends the right headers/body and parses the response", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ cf_order_id: 999, payment_session_id: "session_abc" }),
    });

    const result = await createCashfreeOrder(creds, {
      orderId: "order-ref-123",
      orderAmountPaise: 150000,
      customerPhone: "9876543210",
      returnUrl: "https://example.com/return",
      notifyUrl: "https://example.com/notify",
    });

    expect(result).toEqual({ cfOrderId: "999", paymentSessionId: "session_abc" });
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/orders");
    expect(opts.headers["x-client-id"]).toBe("app-id");
    expect(opts.headers["x-client-secret"]).toBe("secret");
    const body = JSON.parse(opts.body);
    expect(body.order_id).toBe("order-ref-123");
    expect(body.order_amount).toBe(1500); // rupees, not paise
  });

  it("createCashfreeOrder throws (and redacts the secret) on a non-ok response", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => `bad request, secret was ${creds.secretKey}`,
    });

    await expect(
      createCashfreeOrder(creds, {
        orderId: "order-ref-123",
        orderAmountPaise: 100,
        customerPhone: "9876543210",
        returnUrl: "https://example.com/return",
        notifyUrl: "https://example.com/notify",
      }),
    ).rejects.toThrow();
  });

  it("getCashfreeOrderPayments maps rupees to paise and normalises fields", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          {
            cf_payment_id: 555,
            payment_status: "SUCCESS",
            payment_amount: 25.5,
            bank_reference: "UTR999",
          },
        ]),
    });

    const rows = await getCashfreeOrderPayments(creds, "cf-order-1");
    expect(rows).toEqual([
      { cfPaymentId: "555", status: "SUCCESS", amountPaise: 2550, bankReference: "UTR999" },
    ]);
  });
});
