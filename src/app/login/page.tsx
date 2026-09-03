import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const auth = await getCurrentAuth();
  if (auth) redirect("/app/dashboard");

  const { next } = await searchParams;
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/app/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Q Crackers</h1>
        <p className="mt-1 text-sm text-gray-500">Internal console — sign in</p>
        <div className="mt-6">
          <LoginForm next={safeNext} />
        </div>
      </div>
    </main>
  );
}
