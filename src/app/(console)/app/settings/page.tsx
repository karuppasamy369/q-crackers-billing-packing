import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getSettingsForConsole } from "@/server/services/settings-service";
import { PageHeader, Forbidden } from "@/components/console/ui";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "settings.manage")) return <Forbidden />;

  const settings = await getSettingsForConsole();

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        description="Business, tax, shipping, fulfilment and storefront configuration. Changes are audit-logged."
      />
      <SettingsForm settings={settings} />
    </div>
  );
}
