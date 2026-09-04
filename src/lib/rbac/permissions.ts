/**
 * The permission catalogue — the single source of truth.
 *
 * `prisma/seed.ts` syncs these rows into the `permissions` table and wires the
 * role defaults below. Adding a capability to the system means adding its key
 * here first.
 *
 * This file is intentionally free of server-only imports so the console UI can
 * import it to decide which navigation entries to show. Showing/hiding UI is
 * cosmetic only — every action is still authorized on the server.
 */

export const PERMISSIONS = {
  "dashboard.view": { category: "General", description: "View the dashboard" },

  "products.view": {
    category: "Catalogue",
    description: "View products and categories",
  },
  "products.manage": {
    category: "Catalogue",
    description: "Create, edit, and delete products and categories",
  },
  "prices.manage": {
    category: "Catalogue",
    description: "Change product prices",
  },

  "inventory.view": {
    category: "Inventory",
    description: "View stock levels and movements",
  },
  "inventory.adjust": {
    category: "Inventory",
    description: "Adjust stock counts",
  },

  "orders.view": { category: "Orders", description: "View orders" },
  "orders.cancel": { category: "Orders", description: "Cancel an order" },
  "orders.override_state": {
    category: "Orders",
    description: "Force a non-standard order status transition",
  },

  "payments.view": {
    category: "Payments",
    description: "View payment records",
  },
  "payments.confirm_manual": {
    category: "Payments",
    description: "Verify / reject a customer payment (authorised manual check)",
  },
  "payments.account.manage": {
    category: "Payments",
    description: "Manage one's own UPI / payment collection details",
  },
  "payments.refund": { category: "Payments", description: "Record a refund" },

  "billing.view": { category: "Billing", description: "View bills" },
  "billing.create": { category: "Billing", description: "Generate a bill" },
  "billing.cancel": { category: "Billing", description: "Cancel a bill" },

  "booking.view": {
    category: "Booking",
    description: "Open the booking panel",
  },
  "booking.pack": {
    category: "Booking",
    description: "Mark an order as packed",
  },
  "booking.book_parcel": {
    category: "Booking",
    description: "Enter courier / LR details and confirm parcel booking",
  },

  "lr.upload": {
    category: "LR Documents",
    description: "Upload an LR / parcel booking PDF",
  },
  "lr.download": {
    category: "LR Documents",
    description: "Download an LR PDF from the console",
  },

  "customers.view": {
    category: "Customers",
    description: "View customer details",
  },
  "customers.export": {
    category: "Customers",
    description: "Bulk-export customer data",
  },

  "tracking.manage": {
    category: "Tracking",
    description: "Revoke or regenerate customer tracking links",
  },
  "reviews.moderate": {
    category: "Reviews",
    description: "View and unpublish customer reviews",
  },

  "reports.view": {
    category: "Reports",
    description: "View sales and operations reports",
  },

  "staff.manage": {
    category: "Administration",
    description: "Manage internal accounts and their permissions",
  },
  "settings.manage": {
    category: "Administration",
    description: "Change business settings",
  },
  "audit.view_all": {
    category: "Administration",
    description: "View the full audit log",
  },
  "audit.view_own": {
    category: "Administration",
    description: "View one's own audit log entries",
  },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export type RoleKey = "PARTNER" | "STAFF";

/**
 * Role defaults.
 *
 * PARTNER holds every permission (kept in sync automatically — see
 * `partnerPermissions()`), and per-user DENY overrides are not permitted on
 * partner accounts, so a partner can always recover the system.
 *
 * STAFF gets an explicitly enumerated subset. Partners can then grant or revoke
 * individual permissions per staff member via `user_permissions`.
 */
export const STAFF_DEFAULT_PERMISSIONS: PermissionKey[] = [
  "dashboard.view",
  "products.view",
  "inventory.view",
  "orders.view",
  "payments.view",
  "billing.view",
  "billing.create",
  "booking.view",
  "booking.pack",
  "booking.book_parcel",
  "lr.upload",
  "lr.download",
  "customers.view",
  "audit.view_own",
];

export function partnerPermissions(): PermissionKey[] {
  return [...PERMISSION_KEYS];
}

export function roleDefaultPermissions(role: RoleKey): PermissionKey[] {
  return role === "PARTNER"
    ? partnerPermissions()
    : [...STAFF_DEFAULT_PERMISSIONS];
}

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

export function permissionsByCategory(): Record<string, PermissionKey[]> {
  const out: Record<string, PermissionKey[]> = {};
  for (const key of PERMISSION_KEYS) {
    const cat = PERMISSIONS[key].category;
    (out[cat] ??= []).push(key);
  }
  return out;
}
