import { z } from "zod";
import { uuidSchema } from "./common";
import { isValidSlug } from "@/lib/slug";
import { paiseFromRupeesInput, gstRateBpSchema } from "@/lib/money";

const booleanish = z.preprocess(
  (v) =>
    typeof v === "string"
      ? ["true", "on", "1", "yes"].includes(v.toLowerCase())
      : v,
  z.boolean(),
);

const nameSchema = z.string().trim().min(2).max(200);
const descriptionSchema = z
  .string()
  .trim()
  .max(4000)
  .optional()
  .or(z.literal(""));
const sortOrderSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(1_000_000)
  .default(0);

const optionalSlug = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || isValidSlug(v), {
    message: "Use lower-case letters, numbers and hyphens only.",
  })
  .optional();

// --- Categories ----------------------------------------------------------

export const categoryCreateSchema = z.object({
  name: nameSchema,
  slug: optionalSlug,
  description: descriptionSchema,
  sortOrder: sortOrderSchema,
  isActive: booleanish.default(true),
});
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = categoryCreateSchema.partial().extend({
  id: uuidSchema,
});

export const categoryIdSchema = z.object({ id: uuidSchema });

// --- Products -----------------------------------------------------------

export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(60)
  .regex(/^[A-Z0-9][A-Z0-9-]*$/, "Use letters, numbers and hyphens only.");

export const hsnSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{4,8}$/, "HSN code is 4 to 8 digits.")
  .optional()
  .or(z.literal(""));

export const productCreateSchema = z.object({
  sku: skuSchema,
  name: nameSchema,
  slug: optionalSlug,
  categoryId: uuidSchema,
  description: descriptionSchema,
  priceRupees: paiseFromRupeesInput,
  mrpRupees: paiseFromRupeesInput.optional(),
  hsnCode: hsnSchema,
  gstRateBp: gstRateBpSchema.optional(),
  weightGrams: z.coerce.number().int().min(0).max(1_000_000).optional(),
  isActive: booleanish.default(true),
  isVisibleOnline: booleanish.default(false),
  sortOrder: sortOrderSchema,
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

/** Everything except price — price has its own permission (`prices.manage`). */
export const productUpdateSchema = z.object({
  id: uuidSchema,
  sku: skuSchema.optional(),
  name: nameSchema.optional(),
  slug: optionalSlug,
  categoryId: uuidSchema.optional(),
  description: descriptionSchema,
  hsnCode: hsnSchema,
  gstRateBp: gstRateBpSchema.optional(),
  weightGrams: z.coerce.number().int().min(0).max(1_000_000).optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const productPriceSchema = z
  .object({
    id: uuidSchema,
    priceRupees: paiseFromRupeesInput,
    mrpRupees: paiseFromRupeesInput.optional(),
  })
  .refine((v) => v.mrpRupees === undefined || v.mrpRupees >= v.priceRupees, {
    message: "MRP cannot be lower than the selling price.",
    path: ["mrpRupees"],
  });

export const productVisibilitySchema = z.object({
  id: uuidSchema,
  isActive: booleanish,
  isVisibleOnline: booleanish,
});

export const productIdSchema = z.object({ id: uuidSchema });

// --- Inventory ---------------------------------------------------------

export const inventoryAdjustSchema = z
  .object({
    productId: uuidSchema,
    mode: z.enum(["set", "delta"]),
    quantity: z.coerce.number().int(),
    reason: z.enum(["RESTOCK", "ADJUSTMENT"]),
    note: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .refine((v) => (v.mode === "set" ? v.quantity >= 0 : v.quantity !== 0), {
    message:
      "For 'set' the quantity must be zero or more; for 'delta' it must be non-zero.",
    path: ["quantity"],
  })
  .refine((v) => Math.abs(v.quantity) <= 10_000_000, {
    message: "Quantity is out of range.",
    path: ["quantity"],
  });
export type InventoryAdjustInput = z.infer<typeof inventoryAdjustSchema>;

export const reorderLevelSchema = z.object({
  productId: uuidSchema,
  reorderLevel: z.coerce.number().int().min(0).max(10_000_000),
});

// --- Product images --------------------------------------------------

export const productImageMetaSchema = z.object({
  productId: uuidSchema,
  altText: z.string().trim().max(200).optional().or(z.literal("")),
});

export const imageIdSchema = z.object({
  productId: uuidSchema,
  imageId: uuidSchema,
});
