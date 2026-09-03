import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";

describe("security headers", () => {
  it("sets the expected hardening headers on every route", async () => {
    const headerGroups = await nextConfig.headers!();
    const group = headerGroups.find((g) => g.source === "/:path*");
    expect(group).toBeDefined();

    const byKey = new Map(group!.headers.map((h) => [h.key, h.value]));

    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(byKey.get("Strict-Transport-Security")).toContain("max-age=");
    expect(byKey.has("Permissions-Policy")).toBe(true);

    const csp = byKey.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
