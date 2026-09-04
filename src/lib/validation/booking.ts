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
