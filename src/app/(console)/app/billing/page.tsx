import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { ComingSoon, Forbidden } from "@/components/console/ui";

export default async function BillingPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "billing.view")) return <Forbidden />;
  return <ComingSoon module="Billing" />;
}
