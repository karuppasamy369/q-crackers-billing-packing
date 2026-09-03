import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { ComingSoon, Forbidden } from "@/components/console/ui";

export default async function ReportsPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "reports.view")) return <Forbidden />;
  return <ComingSoon module="Reports" phase={10} />;
}
