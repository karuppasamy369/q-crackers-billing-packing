import type { PermissionKey } from "@/lib/rbac/permissions";

export type NavItem = {
  label: string;
  href: string;
  /** The permission required to see and open this module. */
  permission: PermissionKey;
  /** False = module not built yet (placeholder page). */
  available: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/app/dashboard",
    permission: "dashboard.view",
    available: true,
  },
  {
    label: "Products",
    href: "/app/products",
    permission: "products.view",
    available: true,
  },
  {
    label: "Categories",
    href: "/app/categories",
    permission: "products.view",
    available: true,
  },
  {
    label: "Inventory",
    href: "/app/inventory",
    permission: "inventory.view",
    available: true,
  },
  {
    label: "Orders",
    href: "/app/orders",
    permission: "orders.view",
    available: false,
  },
  {
    label: "Billing",
    href: "/app/billing",
    permission: "billing.view",
    available: false,
  },
  {
    label: "Booking",
    href: "/app/booking",
    permission: "booking.view",
    available: false,
  },
  {
    label: "Customers",
    href: "/app/customers",
    permission: "customers.view",
    available: false,
  },
  {
    label: "Reports",
    href: "/app/reports",
    permission: "reports.view",
    available: false,
  },
  {
    label: "Staff",
    href: "/app/staff",
    permission: "staff.manage",
    available: true,
  },
  {
    label: "Settings",
    href: "/app/settings",
    permission: "settings.manage",
    available: true,
  },
  {
    label: "Audit log",
    href: "/app/audit",
    permission: "audit.view_own",
    available: true,
  },
];
