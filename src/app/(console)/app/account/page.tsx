import { requireAuth } from "@/server/rbac/authorize";
import { db } from "@/server/db";
import { PageHeader, Card } from "@/components/console/ui";
import { ChangePasswordForm } from "../../account/change-password-form";

export default async function AccountPage() {
  const auth = await requireAuth();

  const activeSessions = await db.session.count({
    where: {
      userId: auth.user.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  return (
    <div className="max-w-lg space-y-6">
      <PageHeader title="Your account" />

      <Card>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <dt className="text-gray-500">Name</dt>
          <dd className="col-span-2">{auth.user.name}</dd>
          <dt className="text-gray-500">Login code</dt>
          <dd className="col-span-2">{auth.user.code}</dd>
          <dt className="text-gray-500">Email</dt>
          <dd className="col-span-2">{auth.user.email}</dd>
          <dt className="text-gray-500">Role</dt>
          <dd className="col-span-2 uppercase">{auth.user.role}</dd>
          <dt className="text-gray-500">Active sessions</dt>
          <dd className="col-span-2">{activeSessions}</dd>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold">Change password</h2>
        <p className="mb-4 text-xs text-gray-500">
          Changing your password signs you out of every device.
        </p>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
