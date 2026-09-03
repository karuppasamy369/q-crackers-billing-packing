import "server-only";

import { isAppError } from "./errors";

/**
 * Standard result shape for Server Actions used by console forms.
 * Never leak internal error detail — only `AppError.publicMessage` is surfaced.
 */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };

export function actionOk<T = undefined>(
  data?: T,
  message?: string,
): ActionResult<T> {
  return { ok: true, data, message };
}

export function actionFail(err: unknown): ActionResult<never> {
  return {
    ok: false,
    error: isAppError(err)
      ? err.publicMessage
      : "Something went wrong. Please try again.",
  };
}
