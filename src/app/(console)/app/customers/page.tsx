import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { ComingSoon, Forbidden } from "@/components/console/ui";

export default async function CustomersPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "customers.view")) return <Forbidden />;
  return <ComingSoon module="Customers" phase={3} />;
}
