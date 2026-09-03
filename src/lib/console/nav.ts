import type { PermissionKey } from "@/lib/rbac/permissions";

export type NavItem = {
  label: string;
  href: string;
  /** The permission required to see and open this module. */
  permission: PermissionKey;
  /** Development phase that delivers the real module (1 = available now). */
  phase: number;
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/app/dashboard",
    permission: "dashboard.view",
    phase: 1,
  },
  {
    label: "Products",
    href: "/app/products",
    permission: "products.view",
    phase: 2,
  },
  {
    label: "Inventory",
    href: "/app/inventory",
    permission: "inventory.view",
    phase: 2,
  },
  { label: "Orders", href: "/app/orders", permission: "orders.view", phase: 3 },
  {
    label: "Billing",
    href: "/app/billing",
    permission: "billing.view",
    phase: 4,
  },
  {
    label: "Booking",
    href: "/app/booking",
    permission: "booking.view",
    phase: 6,
  },
  {
    label: "Customers",
    href: "/app/customers",
    permission: "customers.view",
    phase: 3,
  },
  {
    label: "Reports",
    href: "/app/reports",
    permission: "reports.view",
    phase: 10,
  },
  { label: "Staff", href: "/app/staff", permission: "staff.manage", phase: 1 },
  {
    label: "Settings",
    href: "/app/settings",
    permission: "settings.manage",
    phase: 2,
  },
  {
    label: "Audit log",
    href: "/app/audit",
    permission: "audit.view_own",
    phase: 1,
  },
];
