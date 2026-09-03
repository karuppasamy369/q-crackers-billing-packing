"use client";

import { useActionState } from "react";
import { updateSettingsAction } from "./actions";
import {
  FormNotice,
  SubmitButton,
  fieldClass,
} from "@/components/console/form";
import {
  settingMeta,
  settingsByGroup,
  type SettingKey,
  type SettingsSnapshot,
} from "@/lib/settings/registry";
import type { ActionResult } from "@/server/http/action-result";

function toInputValue(key: SettingKey, value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "";
  return value == null ? "" : String(value);
}

function SettingRow({
  settingKey,
  value,
}: {
  settingKey: SettingKey;
  value: unknown;
}) {
  const def = settingMeta(settingKey);
  const id = settingKey;

  if (def.input === "boolean") {
    return (
      <label className="flex items-start gap-2 py-2 text-sm">
        <input
          type="checkbox"
          name={settingKey}
          defaultChecked={Boolean(value)}
          className="mt-0.5"
        />
        <span>
          {def.label}
          {def.help ? (
            <span className="block text-xs text-gray-500">{def.help}</span>
          ) : null}
        </span>
      </label>
    );
  }

  return (
    <div className="py-2">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {def.label}
      </label>
      {def.input === "textarea" ? (
        <textarea
          id={id}
          name={settingKey}
          rows={2}
          defaultValue={toInputValue(settingKey, value)}
          className={fieldClass}
        />
      ) : def.input === "select" ? (
        <select
          id={id}
          name={settingKey}
          defaultValue={toInputValue(settingKey, value)}
          className={fieldClass}
        >
          {(def.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={settingKey}
          type={def.input === "number" ? "number" : "text"}
          defaultValue={toInputValue(settingKey, value)}
          className={fieldClass}
        />
      )}
      {def.help ? (
        <p className="mt-1 text-xs text-gray-500">{def.help}</p>
      ) : null}
    </div>
  );
}

export function SettingsForm({ settings }: { settings: SettingsSnapshot }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateSettingsAction,
    null,
  );
  const groups = settingsByGroup();

  return (
    <form action={formAction} className="space-y-6">
      {Object.entries(groups).map(([group, keys]) => (
        <div
          key={group}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="mb-2 text-sm font-semibold text-gray-900">{group}</h2>
          <div className="divide-y divide-gray-100">
            {keys.map((k) => (
              <SettingRow key={k} settingKey={k} value={settings[k]} />
            ))}
          </div>
        </div>
      ))}

      <div className="sticky bottom-0 flex items-center gap-3 bg-gray-50/80 py-3 backdrop-blur">
        <SubmitButton>Save settings</SubmitButton>
        <FormNotice state={state} />
      </div>
    </form>
  );
}
