import { z } from "zod";

/** Email: normalised to trimmed lower-case, shape-checked without the
 *  deprecated `z.string().email()` helper. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .refine((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
    message: "Enter a valid email address.",
  });

export const MIN_PASSWORD_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(200)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
    message: "Include upper-case, lower-case, and a number.",
  });

export const uuidSchema = z.uuid();
