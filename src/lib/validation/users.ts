import { z } from "zod";
import { emailSchema, uuidSchema } from "./common";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/rbac/permissions";

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(120),
  email: emailSchema,
  role: z.enum(["PARTNER", "STAFF"]),
  /// Optional explicit login/billing code (e.g. "PK"). Auto-generated if blank.
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, "Use 2–10 letters/digits, e.g. PK.")
    .optional()
    .or(z.literal("")),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const userIdSchema = z.object({ userId: uuidSchema });

export const setActiveSchema = z.object({
  userId: uuidSchema,
  active: z.boolean(),
});

const permissionKeyEnum = z.enum(
  PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]],
);

export const setOverrideSchema = z.object({
  userId: uuidSchema,
  permission: permissionKeyEnum,
  effect: z.enum(["ALLOW", "DENY"]),
  note: z.string().trim().max(300).optional(),
});
export type SetOverrideInput = z.infer<typeof setOverrideSchema>;

export const removeOverrideSchema = z.object({
  userId: uuidSchema,
  permission: permissionKeyEnum,
});

export const revokeSessionSchema = z.object({
  userId: uuidSchema,
  sessionId: uuidSchema,
});
