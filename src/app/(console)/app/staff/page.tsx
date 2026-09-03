import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { listUsers } from "@/server/services/users-service";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { CreateUserForm } from "./create-user-form";

export default async function StaffPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "staff.manage")) return <Forbidden />;

  const users = await listUsers();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff management"
        description="Internal accounts, their roles, and per-account permissions."
      />

      <Card>
        <h2 className="mb-4 text-sm font-semibold">Create a new account</h2>
        <CreateUserForm />
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Overrides</th>
              <th className="px-4 py-3">Sessions</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-mono">{u.code}</td>
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3 uppercase">{u.role.key}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      u.isActive
                        ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800"
                        : "rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700"
                    }
                  >
                    {u.isActive ? "Active" : "Disabled"}
                  </span>
                  {u.lockedUntil && u.lockedUntil > new Date() ? (
                    <span className="ml-1 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                      Locked
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{u._count.permissionOverrides}</td>
                <td className="px-4 py-3">{u.activeSessions}</td>
                <td className="px-4 py-3 text-gray-500">
                  {u.lastLoginAt
                    ? new Date(u.lastLoginAt).toLocaleString()
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/app/staff/${u.id}`}
                    className="text-gray-700 underline hover:text-gray-900"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
