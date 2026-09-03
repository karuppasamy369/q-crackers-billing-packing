"use server";

import { redirect } from "next/navigation";
import { changeOwnPassword, logout } from "@/server/services/auth-service";
import { isAppError } from "@/server/http/errors";

export type ChangePasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  try {
    await changeOwnPassword({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
  } catch (err) {
    return {
      error: isAppError(err)
        ? err.publicMessage
        : "Could not update your password. Please try again.",
    };
  }

  // Password change revokes all sessions — send them back to sign in.
  redirect("/login?changed=1");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}
