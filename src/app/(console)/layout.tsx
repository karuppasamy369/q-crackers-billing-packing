import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAuth } from "@/server/auth/session";
import { NAV_ITEMS } from "@/lib/console/nav";
import { ChangePasswordForm } from "./account/change-password-form";
import { logoutAction } from "./account/actions";

export const metadata: Metadata = {
  title: "Q Crackers — Console",
  robots: { index: false, follow: false },
};

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getCurrentAuth();
  if (!auth) redirect("/login");

  // First-login / post-reset gate: nothing else is reachable until the
  // temporary password has been replaced.
  if (auth.user.mustChangePassword) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold">Set a new password</h1>
          <p className="mt-1 text-sm text-gray-500">
            Signed in as {auth.user.code}. You must choose a new password before
            continuing.
          </p>
          <div className="mt-6">
            <ChangePasswordForm />
          </div>
          <form action={logoutAction} className="mt-4">
            <button
              type="submit"
              className="text-sm text-gray-500 underline hover:text-gray-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  const nav = NAV_ITEMS.filter((item) => auth.permissions.has(item.permission));

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Q Crackers</span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              Internal console
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">
              {auth.user.name} · {auth.user.code} ·{" "}
              <span className="uppercase">{auth.user.role}</span>
            </span>
            <Link
              href="/app/account"
              className="text-gray-500 underline hover:text-gray-800"
            >
              Account
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <nav className="w-48 shrink-0">
          <ul className="space-y-1 text-sm">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-gray-700 hover:bg-gray-100"
                >
                  <span>{item.label}</span>
                  {!item.available ? (
                    <span className="text-[10px] text-gray-400">soon</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
