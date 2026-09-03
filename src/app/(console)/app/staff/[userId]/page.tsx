import { notFound } from "next/navigation";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getUserDetail } from "@/server/services/users-service";
import { isAppError } from "@/server/http/errors";
import { PageHeader, Forbidden } from "@/components/console/ui";
import { StaffDetail } from "./staff-detail";

export default async function StaffMemberPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "staff.manage")) return <Forbidden />;

  const { userId } = await params;

  let user;
  try {
    user = await getUserDetail(userId);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <div>
      <PageHeader title={`${user.code} — ${user.name}`} />
      <StaffDetail
        userId={user.id}
        code={user.code}
        name={user.name}
        email={user.email}
        role={user.role.key}
        isActive={user.isActive}
        isSelf={user.id === auth.user.id}
        overrides={user.permissionOverrides.map((o) => ({
          permission: o.permission.key,
          effect: o.effect,
          note: o.note,
          createdByCode: o.createdBy?.code ?? null,
          createdAt: o.createdAt.toISOString(),
        }))}
        sessions={user.sessions.map((s) => ({
          id: s.id,
          ip: s.ip,
          userAgent: s.userAgent,
          lastUsedAt: s.lastUsedAt.toISOString(),
          createdAt: s.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
