import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { ComingSoon, Forbidden } from "@/components/console/ui";

export default async function InventoryPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "inventory.view")) return <Forbidden />;
  return <ComingSoon module="Inventory" phase={2} />;
}
