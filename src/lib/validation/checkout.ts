import { z } from "zod";
import { isValidSlug } from "@/lib/slug";
import {
  isValidPincode,
  isValidStateCode,
  normalizeIndianMobile,
} from "@/lib/india";

export const MAX_QTY_PER_LINE = 100;
export const MAX_CART_LINES = 30;

/** The cart only ever carries a public product slug + a quantity — never a
 *  price, name, or internal id. Everything else is looked up server-side. */
export const cartItemSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidSlug, { message: "Invalid item." }),
  quantity: z.coerce.number().int().min(1).max(MAX_QTY_PER_LINE),
});
export type CartItemInput = z.infer<typeof cartItemSchema>;

export const cartSchema = z
  .array(cartItemSchema)
  .min(1, "Your cart is empty.")
  .max(MAX_CART_LINES, "Too many different items in the cart.")
  .refine((items) => new Set(items.map((i) => i.slug)).size === items.length, {
    message: "Duplicate items in the cart.",
  });
export type CartInput = z.infer<typeof cartSchema>;

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Enter a phone number.")
  .refine((v) => normalizeIndianMobile(v) !== null, {
    message: "Enter a valid 10-digit Indian mobile number.",
  });

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
    message: "Enter a valid email address, or leave it blank.",
  })
  .optional();

export const customerDetailsSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  phone: phoneSchema,
  email: optionalEmail,
  addressLine1: z.string().trim().min(3, "Enter your address.").max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2, "Enter your city / town.").max(100),
  stateCode: z
    .string()
    .trim()
    .refine(isValidStateCode, { message: "Choose your state." }),
  pincode: z
    .string()
    .trim()
    .refine(isValidPincode, { message: "Enter a valid 6-digit pincode." }),
});
export type CustomerDetailsInput = z.infer<typeof customerDetailsSchema>;

export const checkoutSchema = z.object({
  items: cartSchema,
  customer: customerDetailsSchema,
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const orderReferenceSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{16,64}$/);
