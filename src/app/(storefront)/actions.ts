"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";

/** Persist the visitor's language choice and return them to the page. */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  const back = formData.get("back");

  if (typeof locale === "string" && isLocale(locale)) {
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  const target =
    typeof back === "string" && back.startsWith("/") && !back.startsWith("//")
      ? back
      : "/";
  redirect(target);
}
