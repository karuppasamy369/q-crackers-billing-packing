"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { submitReview } from "@/server/services/reviews-service";
import { isAppError } from "@/server/http/errors";

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

export type ReviewActionState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

/** Customer submits a rating/review from the tracking page. */
export async function submitReviewAction(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    await submitReview({
      token: formData.get("token"),
      rating: formData.get("rating"),
      comment: formData.get("comment") || undefined,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: isAppError(err)
        ? err.publicMessage
        : "We could not save your review. Please try again.",
    };
  }
}
