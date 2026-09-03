import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { db } from "@/server/db";
import { PageHeader, Card, StatTile, Forbidden } from "@/components/console/ui";

export default async function DashboardPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "dashboard.view")) return <Forbidden />;

  const isPartner = auth.user.role === "PARTNER";

  const [userCount, activeSessions, auditCount] = isPartner
    ? await Promise.all([
        db.user.count(),
        db.session.count({
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
        }),
        db.auditLog.count(),
      ])
    : [null, null, null];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${auth.user.name}`}
        description="Phase 1 is live: authentication, roles and permissions, and the audit log. Catalogue, orders, billing and booking arrive in later phases."
      />

      {isPartner ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Internal accounts" value={userCount ?? 0} />
          <StatTile label="Active sessions" value={activeSessions ?? 0} />
          <StatTile label="Audit entries" value={auditCount ?? 0} />
        </div>
      ) : (
        <Card>
          <p className="text-sm text-gray-600">
            You are signed in as <strong>{auth.user.code}</strong> with the{" "}
            <strong>staff</strong> role. The modules available to you appear in
            the sidebar.
          </p>
        </Card>
      )}
    </div>
  );
}
