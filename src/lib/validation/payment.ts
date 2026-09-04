import { z } from "zod";
import { uuidSchema } from "./common";
import { isValidUpiVpa, isValidUpiReference } from "@/lib/upi";

/** `/s/<code>` — a partner login code, upper-cased. */
export const partnerLinkCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/);

/** Customer submits their UPI transaction id after paying. */
export const submitPaymentSchema = z.object({
  reference: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{16,64}$/),
  upiReference: z
    .string()
    .trim()
    .refine(isValidUpiReference, {
      message: "Enter the 12-digit UPI transaction ID / UTR from your app.",
    }),
  payerName: z.string().trim().max(120).optional().or(z.literal("")),
  payerVpa: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || isValidUpiVpa(v), {
      message: "Enter a valid UPI ID, or leave blank.",
    }),
});
export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;

export const verifyPaymentSchema = z
  .object({
    paymentId: uuidSchema,
    action: z.enum(["verify", "reject"]),
    /** Optional correction to the recorded UTR when verifying. */
    upiReference: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine((v) => !v || isValidUpiReference(v), {
        message: "Enter a valid UPI transaction ID / UTR.",
      }),
    note: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .refine((v) => v.action !== "reject" || (v.note && v.note.length >= 3), {
    message: "A reason is required to reject a payment.",
    path: ["note"],
  });
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const paymentAccountSchema = z.object({
  upiVpa: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || isValidUpiVpa(v), {
      message: "Enter a valid UPI ID, e.g. name@okhdfcbank.",
    }),
  payeeName: z.string().trim().max(120).optional().or(z.literal("")),
  instructions: z.string().trim().max(500).optional().or(z.literal("")),
  isActive: z.preprocess(
    (v) =>
      typeof v === "string"
        ? ["true", "on", "1", "yes"].includes(v.toLowerCase())
        : v,
    z.boolean(),
  ),
  /** Phase 10 — which automatic-verification PSP this partner has onboarded
   *  with, if any. Empty = not onboarded (static-QR / manual-verify flow). No
   *  secret ever travels through this schema — only a display-only account id. */
  pspProvider: z.enum(["CASHFREE", ""]).optional().default(""),
  pspAccountId: z.string().trim().max(200).optional().or(z.literal("")),
});
export type PaymentAccountInput = z.infer<typeof paymentAccountSchema>;

/** A customer opening the Cashfree checkout for an order. */
export const cashfreeSessionSchema = z.object({
  reference: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{16,64}$/),
});

export const paymentIdSchema = z.object({ id: uuidSchema });
