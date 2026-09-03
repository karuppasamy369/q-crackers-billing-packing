import {
  PERMISSION_KEYS,
  type PermissionKey,
  type RoleKey,
} from "./permissions";

export type PermissionOverride = {
  permission: PermissionKey;
  effect: "ALLOW" | "DENY";
};

export type PermissionInput = {
  role: RoleKey;
  /** Permission keys granted by the user's role (from `role_permissions`). */
  roleGrants: PermissionKey[];
  /** Per-user overrides (from `user_permissions`). */
  overrides: PermissionOverride[];
};

/**
 * Compute the effective permission set for a user.
 *
 * Rules:
 *  1. PARTNER always has every permission in the catalogue. DENY overrides are
 *     ignored for partners so the system can never be locked out.
 *  2. For everyone else: start from the role grants, add ALLOW overrides,
 *     then remove DENY overrides. DENY therefore always wins.
 */
export function resolveEffectivePermissions(
  input: PermissionInput,
): Set<PermissionKey> {
  if (input.role === "PARTNER") {
    return new Set(PERMISSION_KEYS);
  }

  const effective = new Set<PermissionKey>(input.roleGrants);

  for (const o of input.overrides) {
    if (o.effect === "ALLOW") effective.add(o.permission);
  }
  for (const o of input.overrides) {
    if (o.effect === "DENY") effective.delete(o.permission);
  }

  return effective;
}

export function can(
  effective: ReadonlySet<PermissionKey>,
  permission: PermissionKey,
): boolean {
  return effective.has(permission);
}

export function canAll(
  effective: ReadonlySet<PermissionKey>,
  permissions: PermissionKey[],
): boolean {
  return permissions.every((p) => effective.has(p));
}

export function canAny(
  effective: ReadonlySet<PermissionKey>,
  permissions: PermissionKey[],
): boolean {
  return permissions.some((p) => effective.has(p));
}
