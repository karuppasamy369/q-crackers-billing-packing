import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { listAuditLogs } from "@/server/services/audit-query";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  if (
    !hasPermission(auth, "audit.view_all") &&
    !hasPermission(auth, "audit.view_own")
  ) {
    return <Forbidden />;
  }

  const sp = await searchParams;
  const result = await listAuditLogs({
    action: sp.action,
    actorCode: sp.actorCode,
    entityType: sp.entityType,
    entityId: sp.entityId,
    page: sp.page ?? 1,
  });

  const mkPage = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/app/audit?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description={
          result.scopedToSelf
            ? "Showing your own actions only."
            : "All recorded actions. Entries are append-only and cannot be edited or deleted."
        }
      />

      <Card className="p-0">
        <form className="flex flex-wrap gap-2 border-b border-gray-200 p-3 text-sm">
          <input
            name="action"
            defaultValue={sp.action ?? ""}
            placeholder="action contains…"
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          {!result.scopedToSelf ? (
            <input
              name="actorCode"
              defaultValue={sp.actorCode ?? ""}
              placeholder="actor code (P1…)"
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          ) : null}
          <input
            name="entityType"
            defaultValue={sp.entityType ?? ""}
            placeholder="entity type"
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white"
          >
            Filter
          </button>
          <Link
            href="/app/audit"
            className="rounded-md border border-gray-300 px-3 py-1.5"
          >
            Clear
          </Link>
        </form>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Summary</th>
              <th className="px-4 py-3">Entity</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.actorCode ?? "system"}
                  {r.actorRole ? (
                    <span className="ml-1 text-xs text-gray-400">
                      {r.actorRole}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                <td className="px-4 py-3">{r.summary}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {r.entityType
                    ? `${r.entityType}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}`
                    : "—"}
                </td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No audit entries match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {result.total} entr{result.total === 1 ? "y" : "ies"} · page{" "}
          {result.page} of {result.pageCount}
        </span>
        <span className="flex gap-2">
          {result.page > 1 ? (
            <Link href={mkPage(result.page - 1)} className="underline">
              ← Newer
            </Link>
          ) : null}
          {result.page < result.pageCount ? (
            <Link href={mkPage(result.page + 1)} className="underline">
              Older →
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
