import { describe, it, expect } from "vitest";
import {
  PERMISSION_KEYS,
  PERMISSIONS,
  STAFF_DEFAULT_PERMISSIONS,
  partnerPermissions,
  roleDefaultPermissions,
  isPermissionKey,
} from "./permissions";

describe("permission catalogue", () => {
  it("has unique keys", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it("gives every permission a category and description", () => {
    for (const key of PERMISSION_KEYS) {
      expect(PERMISSIONS[key].category.length).toBeGreaterThan(0);
      expect(PERMISSIONS[key].description.length).toBeGreaterThan(0);
    }
  });

  it("partner default is the full catalogue", () => {
    expect(new Set(partnerPermissions())).toEqual(new Set(PERMISSION_KEYS));
    expect(roleDefaultPermissions("PARTNER")).toHaveLength(
      PERMISSION_KEYS.length,
    );
  });

  it("staff default is a strict, valid subset", () => {
    for (const key of STAFF_DEFAULT_PERMISSIONS) {
      expect(isPermissionKey(key)).toBe(true);
    }
    expect(STAFF_DEFAULT_PERMISSIONS.length).toBeLessThan(
      PERMISSION_KEYS.length,
    );
  });

  it("does not grant staff any administrative or destructive permission by default", () => {
    const forbidden = [
      "staff.manage",
      "settings.manage",
      "audit.view_all",
      "products.manage",
      "prices.manage",
      "inventory.adjust",
      "orders.cancel",
      "orders.override_state",
      "payments.confirm_manual",
      "payments.refund",
      "billing.cancel",
      "customers.export",
      "tracking.manage",
      "reviews.moderate",
      "reports.view",
    ];
    for (const key of forbidden) {
      expect(STAFF_DEFAULT_PERMISSIONS).not.toContain(key);
    }
  });

  it("rejects unknown permission keys", () => {
    expect(isPermissionKey("does.not.exist")).toBe(false);
  });
});
