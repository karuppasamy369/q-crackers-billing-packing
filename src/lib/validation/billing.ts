import { z } from "zod";
import { uuidSchema } from "./common";
import { isValidStateCode, normalizeIndianMobile } from "@/lib/india";

export const MAX_BILL_LINES = 60;
export const MAX_QTY_PER_BILL_LINE = 5000;

const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (v) =>
      v === "" ||
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v),
    { message: "Enter a valid 15-character GSTIN, or leave blank." },
  )
  .optional()
  .or(z.literal(""));

export const billCustomerSchema = z.object({
  name: z.string().trim().min(1, "Enter the customer name.").max(120),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || normalizeIndianMobile(v) !== null, {
      message: "Enter a valid 10-digit Indian mobile number, or leave blank.",
    }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
      message: "Enter a valid email, or leave blank.",
    }),
  gstin: gstinSchema,
  address: z.string().trim().max(400).optional().or(z.literal("")),
  stateCode: z
    .string()
    .trim()
    .refine(isValidStateCode, { message: "Choose the customer's state." })
    .default("33"),
});
export type BillCustomerInput = z.infer<typeof billCustomerSchema>;

export const counterBillItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.coerce.number().int().min(1).max(MAX_QTY_PER_BILL_LINE),
});

export const counterBillSchema = z.object({
  customer: billCustomerSchema,
  items: z
    .array(counterBillItemSchema)
    .min(1, "Add at least one item.")
    .max(MAX_BILL_LINES, "Too many line items.")
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      { message: "The same product appears more than once." },
    ),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type CounterBillInput = z.infer<typeof counterBillSchema>;

export const billIdSchema = z.object({ id: uuidSchema });

export const cancelBillSchema = z.object({
  id: uuidSchema,
  reason: z.string().trim().min(3, "Enter a reason.").max(300),
});

export const issueBillForOrderSchema = z.object({ orderId: uuidSchema });
