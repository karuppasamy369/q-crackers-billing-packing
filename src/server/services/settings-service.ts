import "server-only";

import { cache } from "react";
import { db } from "@/server/db";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { ValidationError } from "@/server/http/errors";
import {
  SETTINGS,
  PUBLIC_SETTING_KEYS,
  isSettingKey,
  defaultSettings,
  type SettingKey,
  type SettingsSnapshot,
  type PublicSettingsSnapshot,
} from "@/lib/settings/registry";

/**
 * Read every setting, merging stored rows over the registry defaults.
 * Memoised per request. Never requires auth — safe for the storefront via
 * `getPublicSettings()`.
 */
export const getEffectiveSettings = cache(
  async (): Promise<SettingsSnapshot> => {
    const rows = await db.setting.findMany();
    const snapshot = defaultSettings();

    for (const row of rows) {
      if (!isSettingKey(row.key)) continue;
      const parsed = SETTINGS[row.key].schema.safeParse(row.value);
      if (parsed.success) {
        // Key/value types line up by construction; the generic index needs a cast.
        (snapshot[row.key] as unknown) = parsed.data;
      }
    }
    return snapshot;
  },
);

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<SettingsSnapshot[K]> {
  const all = await getEffectiveSettings();
  return all[key];
}

/** The subset that is safe to expose to the public storefront. */
export async function getPublicSettings(): Promise<PublicSettingsSnapshot> {
  const all = await getEffectiveSettings();
  const out = {} as PublicSettingsSnapshot;
  for (const key of PUBLIC_SETTING_KEYS) {
    (out[key] as unknown) = all[key];
  }
  return out;
}

/** For the console settings form (partner only) — includes private values. */
export async function getSettingsForConsole(): Promise<SettingsSnapshot> {
  await requirePermission("settings.manage");
  return getEffectiveSettings();
}

export type SettingsUpdateResult = {
  changed: SettingKey[];
};

/**
 * Validate and persist a partial settings update. One audit entry is written
 * listing every key that actually changed.
 */
export async function updateSettings(
  patch: Record<string, unknown>,
): Promise<SettingsUpdateResult> {
  const auth = await requirePermission("settings.manage");
  const ctx = await getRequestContext();

  const current = await getEffectiveSettings();
  const validated: { key: SettingKey; value: unknown }[] = [];
  const errors: string[] = [];

  for (const [key, rawValue] of Object.entries(patch)) {
    if (!isSettingKey(key)) {
      errors.push(`Unknown setting "${key}".`);
      continue;
    }
    const parsed = SETTINGS[key].schema.safeParse(rawValue);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "invalid value";
      errors.push(`${SETTINGS[key].label}: ${msg}`);
      continue;
    }
    validated.push({ key, value: parsed.data });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join(" "));
  }

  const changed: SettingKey[] = [];
  const changeDetail: Record<string, { from: unknown; to: unknown }> = {};

  await db.$transaction(async (tx) => {
    for (const { key, value } of validated) {
      const before = current[key];
      if (JSON.stringify(before) === JSON.stringify(value)) continue;

      await tx.setting.upsert({
        where: { key },
        create: {
          key,
          value: value as never,
          updatedById: auth.user.id,
        },
        update: { value: value as never, updatedById: auth.user.id },
      });
      changed.push(key);
      changeDetail[key] = { from: before, to: value };
    }

    if (changed.length > 0) {
      await recordAudit(
        {
          kind: "user",
          userId: auth.user.id,
          code: auth.user.code,
          role: auth.user.role,
        },
        {
          action: "settings.update",
          summary: `${auth.user.code} updated settings: ${changed.join(", ")}`,
          entityType: "Setting",
          details: changeDetail,
        },
        ctx,
        tx,
      );
    }
  });

  return { changed };
}
