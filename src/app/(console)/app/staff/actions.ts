"use server";

import { revalidatePath } from "next/cache";
import { isAppError } from "@/server/http/errors";
import {
  createUser,
  setUserActive,
  resetUserPassword,
  setPermissionOverride,
  removePermissionOverride,
  revokeUserSession,
} from "@/server/services/users-service";

export type ActionResult =
  | { ok: true; message?: string; secret?: { code: string; password: string } }
  | { ok: false; error: string };

function fail(err: unknown): ActionResult {
  return {
    ok: false,
    error: isAppError(err) ? err.publicMessage : "Something went wrong.",
  };
}

export async function createUserAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { code, temporaryPassword } = await createUser({
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
      code: formData.get("code") || undefined,
    });
    revalidatePath("/app/staff");
    return {
      ok: true,
      message: `Account ${code} created.`,
      secret: { code, password: temporaryPassword },
    };
  } catch (err) {
    return fail(err);
  }
}

export async function setActiveAction(
  userId: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    await setUserActive({ userId, active });
    revalidatePath(`/app/staff/${userId}`);
    revalidatePath("/app/staff");
    return {
      ok: true,
      message: active ? "Account reactivated." : "Account deactivated.",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function resetPasswordAction(
  userId: string,
): Promise<ActionResult> {
  try {
    const { temporaryPassword } = await resetUserPassword({ userId });
    revalidatePath(`/app/staff/${userId}`);
    return {
      ok: true,
      message: "Password reset. Share the temporary password securely.",
      secret: { code: userId, password: temporaryPassword },
    };
  } catch (err) {
    return fail(err);
  }
}

export async function setOverrideAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await setPermissionOverride({
      userId: formData.get("userId"),
      permission: formData.get("permission"),
      effect: formData.get("effect"),
      note: formData.get("note") || undefined,
    });
    revalidatePath(`/app/staff/${formData.get("userId")}`);
    return { ok: true, message: "Permission override saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function removeOverrideAction(
  userId: string,
  permission: string,
): Promise<ActionResult> {
  try {
    await removePermissionOverride({ userId, permission });
    revalidatePath(`/app/staff/${userId}`);
    return { ok: true, message: "Override removed." };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeSessionAction(
  userId: string,
  sessionId: string,
): Promise<ActionResult> {
  try {
    await revokeUserSession({ userId, sessionId });
    revalidatePath(`/app/staff/${userId}`);
    return { ok: true, message: "Session revoked." };
  } catch (err) {
    return fail(err);
  }
}
