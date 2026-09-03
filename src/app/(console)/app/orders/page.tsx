import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { ComingSoon, Forbidden } from "@/components/console/ui";

export default async function OrdersPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "orders.view")) return <Forbidden />;
  return <ComingSoon module="Orders" phase={3} />;
}
