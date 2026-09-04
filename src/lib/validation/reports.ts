import { z } from "zod";

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), {
    message: "That is not a valid date.",
  });

const MAX_SPAN_DAYS = 400;

/**
 * A validated reporting window. Defaults to the last 30 days. Both ends are
 * inclusive dates; the service turns them into a `[from 00:00, to+1d 00:00)`
 * half-open UTC range.
 */
export const reportRangeSchema = z
  .object({
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .transform((v) => {
    const today = new Date();
    const toStr = v.to ?? today.toISOString().slice(0, 10);
    const fromStr =
      v.from ??
      new Date(today.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
    return { from: fromStr, to: toStr };
  })
  .refine((v) => v.from <= v.to, {
    message: "The start date must be on or before the end date.",
  })
  .refine(
    (v) => {
      const span =
        (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) /
        86_400_000;
      return span <= MAX_SPAN_DAYS;
    },
    { message: `Choose a range of at most ${MAX_SPAN_DAYS} days.` },
  )
  .refine(
    (v) => {
      const min = Date.UTC(2020, 0, 1);
      const max = Date.now() + 2 * 86_400_000;
      return (
        Date.parse(`${v.from}T00:00:00Z`) >= min &&
        Date.parse(`${v.to}T00:00:00Z`) <= max
      );
    },
    { message: "Dates must be between 2020 and today." },
  );

export type ReportRange = z.infer<typeof reportRangeSchema>;

/** Turn an inclusive `{from,to}` date range into a half-open UTC `[gte, lt)`. */
export function toDateWindow(range: ReportRange): { gte: Date; lt: Date } {
  return {
    gte: new Date(`${range.from}T00:00:00.000Z`),
    lt: new Date(Date.parse(`${range.to}T00:00:00.000Z`) + 86_400_000),
  };
}
