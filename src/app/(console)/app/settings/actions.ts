"use server";

import { revalidatePath } from "next/cache";
import {
  actionOk,
  actionFail,
  type ActionResult,
} from "@/server/http/action-result";
import { updateSettings } from "@/server/services/settings-service";
import { SETTINGS, SETTING_KEYS } from "@/lib/settings/registry";

function parseCsv(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateSettingsAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const patch: Record<string, unknown> = {};

  for (const key of SETTING_KEYS) {
    const def = SETTINGS[key];
    if (def.input === "boolean") {
      patch[key] = fd.get(key) !== null;
      continue;
    }
    const raw = fd.get(key);
    if (typeof raw !== "string") continue;
    patch[key] = def.input === "csv" ? parseCsv(raw) : raw;
  }

  try {
    const { changed } = await updateSettings(patch);
    revalidatePath("/app/settings");
    return actionOk(
      undefined,
      changed.length
        ? `Updated ${changed.length} setting${changed.length === 1 ? "" : "s"}.`
        : "No changes.",
    );
  } catch (err) {
    return actionFail(err);
  }
}
