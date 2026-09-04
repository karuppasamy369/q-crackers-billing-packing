import { z } from "zod";
import { uuidSchema } from "./common";

/** `orderId` in the URL / form for every booking action. */
export const bookingOrderIdSchema = z.object({ orderId: uuidSchema });

/**
 * Courier / transport company name. Free text, but bounded and stripped of
 * control characters.
 */
const courierNameSchema = z
  .string()
  .trim()
  .min(2, "Enter the courier / transport name.")
  .max(120, "Courier name is too long.");

/**
 * LR / consignment number. Couriers use letters, digits, spaces, `-` and `/`.
 */
const lrNumberSchema = z
  .string()
  .trim()
  .min(1, "Enter the LR / parcel number.")
  .max(80, "LR number is too long.")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9 _/-]*$/,
    "LR number can only contain letters, digits, spaces, - and /.",
  );

/** `YYYY-MM-DD` from a date input, sanity-bounded. */
const bookingDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the booking date.")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), {
    message: "That is not a valid date.",
  })
  .refine(
    (v) => {
      const d = new Date(`${v}T00:00:00Z`);
      const now = Date.now();
      const twoDays = 2 * 24 * 60 * 60 * 1000;
      const year2020 = Date.UTC(2020, 0, 1);
      return d.getTime() >= year2020 && d.getTime() <= now + twoDays;
    },
    { message: "The booking date cannot be in the future or long past." },
  );

const parcelCountSchema = z.coerce
  .number({ message: "Enter the number of parcels." })
  .int("Parcel count must be a whole number.")
  .min(1, "There must be at least one parcel.")
  .max(999, "That is too many parcels.");

const remarksSchema = z
  .string()
  .trim()
  .max(1000, "Remarks are too long.")
  .optional()
  .or(z.literal(""));

/**
 * The mandatory courier / LR details required to confirm PARCEL_BOOKED and to
 * edit an already-booked parcel.
 */
export const bookParcelSchema = z.object({
  orderId: uuidSchema,
  courierName: courierNameSchema,
  lrNumber: lrNumberSchema,
  bookingDate: bookingDateSchema,
  parcelCount: parcelCountSchema,
  remarks: remarksSchema,
});
export type BookParcelInput = z.infer<typeof bookParcelSchema>;

// ---------------------------------------------------------------------------
// Ready to Book report + Cover print (Feature: booking consolidation)
// ---------------------------------------------------------------------------

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), {
    message: "That is not a valid date.",
  })
  .optional()
  .or(z.literal(""));

const shortText = z.string().trim().max(120).optional().or(z.literal(""));

/**
 * Server-side filters for the Ready to Book view. All optional — an empty
 * filter returns every order that is currently ready for parcel booking.
 */
export const readyToBookFilterSchema = z
  .object({
    from: optionalDate,
    to: optionalDate,
    courier: shortText,
    partnerCode: z
      .string()
      .trim()
      .toUpperCase()
      .max(10)
      .regex(/^[A-Z0-9]*$/)
      .optional()
      .or(z.literal("")),
    city: shortText,
    pincode: z
      .string()
      .trim()
      .regex(/^\d{0,6}$/, "Pincode is up to 6 digits.")
      .optional()
      .or(z.literal("")),
    q: z.string().trim().max(120).optional().or(z.literal("")),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "The start date must be on or before the end date.",
    path: ["to"],
  });
export type ReadyToBookFilter = z.infer<typeof readyToBookFilterSchema>;

/** Parcel-cover print request for one order. */
export const coverPrintSchema = z.object({
  orderId: uuidSchema,
  /** How many parcels this consignment has (defaults to the booking value or 1). */
  parcels: z.coerce.number().int().min(1).max(50).default(1),
  /** When set, print only this one parcel number (1-based). */
  only: z.coerce.number().int().min(1).max(50).optional(),
});

/** Bulk parcel-cover print — a set of order ids. */
export const coverBulkSchema = z.object({
  orderIds: z.array(uuidSchema).min(1).max(100),
});
