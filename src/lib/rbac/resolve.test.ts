import { describe, it, expect } from "vitest";
import { resolveEffectivePermissions, can, canAll, canAny } from "./resolve";
import { PERMISSION_KEYS } from "./permissions";

describe("resolveEffectivePermissions", () => {
  it("gives a partner every permission, ignoring role grants and DENY overrides", () => {
    const eff = resolveEffectivePermissions({
      role: "PARTNER",
      roleGrants: [],
      overrides: [{ permission: "booking.pack", effect: "DENY" }],
    });
    expect(eff.size).toBe(PERMISSION_KEYS.length);
    expect(eff.has("booking.pack")).toBe(true);
    expect(eff.has("staff.manage")).toBe(true);
  });

  it("starts a staff user from their role grants", () => {
    const eff = resolveEffectivePermissions({
      role: "STAFF",
      roleGrants: ["orders.view", "booking.pack"],
      overrides: [],
    });
    expect([...eff].sort()).toEqual(["booking.pack", "orders.view"]);
  });

  it("adds ALLOW overrides", () => {
    const eff = resolveEffectivePermissions({
      role: "STAFF",
      roleGrants: ["orders.view"],
      overrides: [{ permission: "reports.view", effect: "ALLOW" }],
    });
    expect(eff.has("reports.view")).toBe(true);
  });

  it("removes DENY overrides", () => {
    const eff = resolveEffectivePermissions({
      role: "STAFF",
      roleGrants: ["orders.view", "billing.create"],
      overrides: [{ permission: "billing.create", effect: "DENY" }],
    });
    expect(eff.has("billing.create")).toBe(false);
    expect(eff.has("orders.view")).toBe(true);
  });

  it("lets DENY win over ALLOW for the same permission", () => {
    const eff = resolveEffectivePermissions({
      role: "STAFF",
      roleGrants: [],
      overrides: [
        { permission: "reports.view", effect: "ALLOW" },
        { permission: "reports.view", effect: "DENY" },
      ],
    });
    expect(eff.has("reports.view")).toBe(false);
  });

  it("helper predicates behave correctly", () => {
    const eff = resolveEffectivePermissions({
      role: "STAFF",
      roleGrants: ["orders.view", "booking.pack"],
      overrides: [],
    });
    expect(can(eff, "orders.view")).toBe(true);
    expect(can(eff, "staff.manage")).toBe(false);
    expect(canAll(eff, ["orders.view", "booking.pack"])).toBe(true);
    expect(canAll(eff, ["orders.view", "staff.manage"])).toBe(false);
    expect(canAny(eff, ["staff.manage", "booking.pack"])).toBe(true);
    expect(canAny(eff, ["staff.manage", "settings.manage"])).toBe(false);
  });
});
