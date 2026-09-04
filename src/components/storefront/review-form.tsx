"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  submitReviewAction,
  type ReviewActionState,
} from "@/app/(storefront)/actions";
import type { Dictionary } from "@/lib/i18n";

/** Star rating + optional comment, submitted from the tracking page. */
export function ReviewForm({ token, t }: { token: string; t: Dictionary }) {
  const rv = t.review;
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [state, formAction, pending] = useActionState<
    ReviewActionState,
    FormData
  >(submitReviewAction, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const shown = hover || rating;

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="token" value={token} readOnly />
      <input type="hidden" name="rating" value={rating} readOnly />

      <p className="text-xs text-gray-500">{rv.prompt}</p>

      <div>
        <p className="text-xs font-medium text-gray-600">{rv.ratingLabel}</p>
        <div
          className="mt-1 flex gap-1"
          role="radiogroup"
          aria-label={rv.ratingLabel}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={rv.starAria.replace("{n}", String(n))}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className={`text-2xl leading-none transition-colors ${
                n <= shown ? "text-amber-500" : "text-gray-300"
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          htmlFor="review-comment"
          className="text-xs font-medium text-gray-600"
        >
          {rv.commentLabel}
        </label>
        <textarea
          id="review-comment"
          name="comment"
          rows={3}
          maxLength={1000}
          placeholder={rv.commentPlaceholder}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
        />
      </div>

      {state?.ok === false ? (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || rating === 0}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? rv.submitting : rv.submit}
      </button>
    </form>
  );
}
