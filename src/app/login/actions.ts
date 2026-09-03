"use server";

import { redirect } from "next/navigation";
import { login } from "@/server/services/auth-service";

export type LoginState = { error?: string };

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  // Only allow internal absolute paths — never an open redirect.
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/app/dashboard";
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const result = await login({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.ok) return { error: result.message };

  redirect(safeNext(formData.get("next")));
}
