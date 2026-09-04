/**
 * Phase 9 — final security hardening sweep. Confirms staff/partner boundaries
 * across the Phase 9 surfaces and that earlier controls are intact.
 * Skipped unless TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  TEST_DB,
  db as prisma,
  loginAs,
  logout,
  resetCatalogue,
} from "./_context";
import { _resetRateLimits } from "@/lib/rate-limit";
import {
  PERMISSION_KEYS,
  STAFF_DEFAULT_PERMISSIONS,
} from "@/lib/rbac/permissions";
import { getReportsBundle } from "@/server/services/reports-service";
import { listReviews } from "@/server/services/reviews-service";
import { listNotifications } from "@/server/services/notifications-service";
import { regenerateTrackingToken } from "@/server/services/tracking-service";
import nextConfig from "../../next.config";

const d = TEST_DB ? describe : describe.skip;

d("Phase 9 — security hardening", () => {
  beforeEach(async () => {
    await resetCatalogue(prisma);
    await prisma.userPermission.deleteMany();
    _resetRateLimits();
    logout();
  });

  it("Phase 9 admin surfaces are partner-only by default", () => {
    for (const perm of [
      "reports.view",
      "reviews.moderate",
      "notifications.manage",
      "tracking.manage",
      "audit.view_all",
    ]) {
      expect(PERMISSION_KEYS).toContain(perm);
      expect(STAFF_DEFAULT_PERMISSIONS).not.toContain(perm);
    }
  });

  it("staff cannot reach reports, reviews, notifications or tracking admin", async () => {
    await loginAs(prisma, "S1");
    await expect(getReportsBundle({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(listReviews({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listNotifications({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      regenerateTrackingToken({
        orderId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    logout();
  });

  it("a partner reaches them (DENY is ignored for partners)", async () => {
    // Even a DENY override cannot lock a partner out.
    const partner = await prisma.user.findUniqueOrThrow({
      where: { code: "PSR" },
    });
    const perm = await prisma.permission.findUniqueOrThrow({
      where: { key: "reports.view" },
    });
    await prisma.userPermission.create({
      data: { userId: partner.id, permissionId: perm.id, effect: "DENY" },
    });
    await loginAs(prisma, "PSR");
    const bundle = await getReportsBundle({});
    expect(bundle.totals).toBeDefined();
    logout();
  });

  it("the audit trigger keeps the log append-only", async () => {
    const row = await prisma.auditLog.findFirst();
    if (!row) return;
    await expect(
      prisma.auditLog.update({
        where: { id: row.id },
        data: { summary: "tampered" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditLog.delete({ where: { id: row.id } }),
    ).rejects.toThrow();
  });

  it("the Server Action body limit clears the document upload cap", () => {
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;
    expect(limit).toBeDefined();
    const mb = Number(String(limit).replace(/mb$/i, ""));
    expect(mb).toBeGreaterThanOrEqual(11); // >= STORAGE_MAX_DOCUMENT_BYTES (10 MB)
  });

  it("global security headers are unchanged", async () => {
    const groups = await nextConfig.headers!();
    const base = groups.find((g) => g.source === "/:path*");
    const byKey = new Map(base!.headers.map((h) => [h.key, h.value]));
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    const track = groups.find((g) => g.source === "/track/:path*");
    expect(
      new Map(track!.headers.map((h) => [h.key, h.value])).get(
        "Referrer-Policy",
      ),
    ).toBe("no-referrer");
  });
});
