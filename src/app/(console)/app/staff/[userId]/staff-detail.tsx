"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import {
  setActiveAction,
  resetPasswordAction,
  setOverrideAction,
  removeOverrideAction,
  revokeSessionAction,
  type ActionResult,
} from "../actions";
import { PERMISSIONS, STAFF_DEFAULT_PERMISSIONS } from "@/lib/rbac/permissions";

type OverrideView = {
  permission: string;
  effect: "ALLOW" | "DENY";
  note: string | null;
  createdByCode: string | null;
  createdAt: string;
};

type SessionView = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  lastUsedAt: string;
  createdAt: string;
};

export type StaffDetailProps = {
  userId: string;
  code: string;
  name: string;
  email: string;
  role: "PARTNER" | "STAFF";
  isActive: boolean;
  isSelf: boolean;
  overrides: OverrideView[];
  sessions: SessionView[];
};

const box = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";

function Notice({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  if (result.ok) {
    return (
      <div className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
        {result.message}
        {result.secret ? (
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 font-mono">
            {result.secret.password}
          </code>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {result.error}
    </div>
  );
}

export function StaffDetail(props: StaffDetailProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => setResult(await fn()));

  const [overrideState, overrideFormAction] = useActionState<
    ActionResult | null,
    FormData
  >(setOverrideAction, null);

  const grantableForDeny = STAFF_DEFAULT_PERMISSIONS;
  const grantableForAllow = (
    Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]
  ).filter((k) => !STAFF_DEFAULT_PERMISSIONS.includes(k));

  return (
    <div className="space-y-6">
      <div className={box}>
        <h2 className="text-sm font-semibold">Account</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <dt className="text-gray-500">Code</dt>
          <dd className="col-span-2 font-mono">{props.code}</dd>
          <dt className="text-gray-500">Name</dt>
          <dd className="col-span-2">{props.name}</dd>
          <dt className="text-gray-500">Email</dt>
          <dd className="col-span-2">{props.email}</dd>
          <dt className="text-gray-500">Role</dt>
          <dd className="col-span-2 uppercase">{props.role}</dd>
          <dt className="text-gray-500">Status</dt>
          <dd className="col-span-2">
            {props.isActive ? "Active" : "Disabled"}
          </dd>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={pending || props.isSelf}
            onClick={() =>
              run(() => setActiveAction(props.userId, !props.isActive))
            }
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {props.isActive ? "Deactivate account" : "Reactivate account"}
          </button>
          <button
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  "Reset this account's password? All their sessions will be revoked.",
                )
              )
                run(() => resetPasswordAction(props.userId));
            }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Reset password
          </button>
        </div>
        {props.isSelf ? (
          <p className="mt-2 text-xs text-gray-500">
            You cannot change your own account status.
          </p>
        ) : null}
        <Notice result={result} />
      </div>

      {props.role === "PARTNER" ? (
        <div className={box}>
          <h2 className="text-sm font-semibold">Permissions</h2>
          <p className="mt-1 text-sm text-gray-500">
            Partner accounts always have full access. Per-account overrides are
            not available.
          </p>
        </div>
      ) : (
        <div className={box}>
          <h2 className="text-sm font-semibold">Permission overrides</h2>
          <p className="mt-1 text-sm text-gray-500">
            Staff start from the default staff permission set. Add an ALLOW to
            grant something extra, or a DENY to remove a default.
          </p>

          {props.overrides.length > 0 ? (
            <table className="mt-3 w-full text-sm">
              <tbody>
                {props.overrides.map((o) => (
                  <tr key={o.permission} className="border-b border-gray-100">
                    <td className="py-2">
                      <span
                        className={
                          o.effect === "ALLOW"
                            ? "rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800"
                            : "rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800"
                        }
                      >
                        {o.effect}
                      </span>{" "}
                      <span className="font-mono">{o.permission}</span>
                      {o.note ? (
                        <span className="ml-2 text-gray-500">— {o.note}</span>
                      ) : null}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            removeOverrideAction(props.userId, o.permission),
                          )
                        }
                        className="text-gray-500 underline hover:text-gray-800"
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-gray-400">No overrides.</p>
          )}

          <form action={overrideFormAction} className="mt-4 space-y-2">
            <input type="hidden" name="userId" value={props.userId} />
            <div className="flex flex-wrap gap-2">
              <select
                name="effect"
                defaultValue="ALLOW"
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="ALLOW">ALLOW</option>
                <option value="DENY">DENY</option>
              </select>
              <select
                name="permission"
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <optgroup label="Grant (ALLOW)">
                  {grantableForAllow.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Revoke (DENY)">
                  {grantableForDeny.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </optgroup>
              </select>
              <input
                name="note"
                placeholder="Reason (optional)"
                className="min-w-40 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Save override
              </button>
            </div>
            <Notice result={overrideState} />
          </form>
        </div>
      )}

      <div className={box}>
        <h2 className="text-sm font-semibold">Active sessions</h2>
        {props.sessions.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">No active sessions.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <tbody>
              {props.sessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="py-2">
                    <div className="text-gray-700">{s.ip ?? "unknown IP"}</div>
                    <div className="text-xs text-gray-400">
                      {s.userAgent ?? "unknown device"}
                    </div>
                    <div className="text-xs text-gray-400">
                      last used {new Date(s.lastUsedAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      disabled={pending}
                      onClick={() =>
                        run(() => revokeSessionAction(props.userId, s.id))
                      }
                      className="text-gray-500 underline hover:text-gray-800"
                    >
                      revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Link
        href="/app/staff"
        className="inline-block text-sm text-gray-500 underline hover:text-gray-800"
      >
        ← Back to staff list
      </Link>
    </div>
  );
}
