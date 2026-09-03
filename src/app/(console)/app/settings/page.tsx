import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { ComingSoon, Forbidden } from "@/components/console/ui";

export default async function SettingsPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "settings.manage")) return <Forbidden />;
  return <ComingSoon module="Settings" phase={2} />;
}
