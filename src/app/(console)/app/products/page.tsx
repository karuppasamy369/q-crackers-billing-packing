import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { ComingSoon, Forbidden } from "@/components/console/ui";

export default async function ProductsPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "products.view")) return <Forbidden />;
  return <ComingSoon module="Products" phase={2} />;
}
