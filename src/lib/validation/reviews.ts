import { z } from "zod";
import { uuidSchema } from "./common";
import { trackingTokenSchema } from "./tracking";

export const REVIEW_COMMENT_MAX = 1000;

/** Drop control characters (keeping tab and newline) so stored text is
 *  display-safe. React already escapes on render — this is defence in depth. */
function stripControlChars(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl =
      (code <= 0x08 && code >= 0) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f;
    if (!isControl) out += ch;
  }
  return out;
}

/** Customer-submitted review from the tracking page. */
export const submitReviewSchema = z.object({
  token: trackingTokenSchema,
  rating: z.coerce
    .number({ message: "Choose a star rating." })
    .int()
    .min(1, "Choose a star rating.")
    .max(5, "The rating must be between 1 and 5 stars."),
  comment: z
    .string()
    .trim()
    .max(
      REVIEW_COMMENT_MAX,
      `Keep your review under ${REVIEW_COMMENT_MAX} characters.`,
    )
    .transform(stripControlChars)
    .optional()
    .or(z.literal("")),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

/** Partner moderation action. */
export const moderateReviewSchema = z.object({
  id: uuidSchema,
  action: z.enum(["hide", "publish", "delete"]),
  note: z
    .string()
    .trim()
    .max(300)
    .transform(stripControlChars)
    .optional()
    .or(z.literal("")),
});
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

export const reviewListFilterSchema = z.object({
  status: z.enum(["PUBLISHED", "HIDDEN"]).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
