import { describe, it, expect, vi, afterEach } from "vitest";
import { MetaWhatsAppProvider } from "./meta-provider";
import type { OutboundMessage } from "./types";

const TOKEN = "EAAG_super_secret_access_token_value";
const provider = new MetaWhatsAppProvider({
  accessToken: TOKEN,
  phoneNumberId: "111222333",
  apiVersion: "v21.0",
});

const MSG: OutboundMessage = {
  toE164: "+919876543210",
  body: "Q Crackers: Hi Ravi, ... https://x/track/abc",
  locale: "ta",
  templateName: "payment_received",
  templateParams: ["Ravi", "₹100.00", "PK-2026-0001", "https://x/track/abc"],
};

function mockFetch(
  status: number,
  body: unknown,
  opts: { throws?: boolean } = {},
) {
  const fn = vi.fn(
    async (_url: string, _init?: RequestInit): Promise<Response> => {
      if (opts.throws) throw new Error("ECONNRESET");
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
      } as Response;
    },
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("MetaWhatsAppProvider", () => {
  it("posts a template message to the right endpoint with a Bearer token", async () => {
    const fetchFn = mockFetch(200, { messages: [{ id: "wamid.ABC" }] });
    const res = await provider.send(MSG);

    expect(res).toEqual({ ok: true, providerMessageId: "wamid.ABC" });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v21.0/111222333/messages");
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
    });
    const payload = JSON.parse(init?.body as string);
    expect(payload.to).toBe("919876543210"); // no leading +
    expect(payload.type).toBe("template");
    expect(payload.template.name).toBe("payment_received");
    expect(payload.template.language.code).toBe("ta");
    expect(payload.template.components[0].parameters).toHaveLength(4);
  });

  it("classifies 5xx and 429 as retryable, other 4xx as permanent", async () => {
    mockFetch(503, { error: { message: "upstream" } });
    expect(await provider.send(MSG)).toMatchObject({
      ok: false,
      retryable: true,
    });

    mockFetch(429, { error: { message: "rate limited" } });
    expect(await provider.send(MSG)).toMatchObject({
      ok: false,
      retryable: true,
    });

    mockFetch(400, { error: { message: "invalid recipient" } });
    expect(await provider.send(MSG)).toMatchObject({
      ok: false,
      retryable: false,
    });
  });

  it("treats a network error as retryable", async () => {
    mockFetch(0, {}, { throws: true });
    expect(await provider.send(MSG)).toMatchObject({
      ok: false,
      retryable: true,
    });
  });

  it("scrubs the access token from the error summary if the API reflects it", async () => {
    mockFetch(401, { error: { message: `token ${TOKEN} rejected` } });
    const res = await provider.send(MSG);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).not.toContain(TOKEN);
      expect(res.error).not.toContain("Bearer");
      expect(res.error).toContain("[redacted]");
    }
  });
});
